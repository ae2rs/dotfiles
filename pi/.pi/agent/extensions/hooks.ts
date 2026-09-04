/**
 * Hooks Extension — Claude Code-style hooks for Pi.
 *
 * Part 1: declarative lifecycle hooks from ~/.pi/agent/hooks.json:
 *
 *   {
 *     "tool_call":     [{ "matcher": "bash|edit", "command": "shell cmd", "timeoutMs": 30000 }],
 *     "tool_result":   [{ "matcher": "bash",      "command": "shell cmd" }],
 *     "agent_settled": [{ "command": "shell cmd" }],
 *     "session_start": [{ "command": "shell cmd" }]
 *   }
 *
 * Hook commands receive event JSON on stdin (CC-style wire format):
 *   { hook_event_name, tool_name, tool_input, tool_call_id, cwd, ... }
 *
 * Semantics:
 * - tool_call: exit code 2 blocks the tool (stderr is fed back to the model as
 *   the reason). Stdout JSON {"block": true, "reason": "..."} also blocks.
 * - tool_result: stdout JSON may patch the result: {"content"?, "details"?,
 *   "isError"?}. String content is wrapped into a text content block.
 * - agent_settled / session_start: stdout is injected as a context message for
 *   the next turn (matcher is meaningless here and ignored).
 * - matcher: "|"-separated, matches on equality or substring of the tool name.
 *   Empty/omitted matcher matches everything.
 *
 * Part 2: run_detached tool + /hooks command. run_detached spawns a command in
 * its own process group and returns immediately; when it exits, the agent is
 * woken with the exit code and tail of the output. /hooks lists detached jobs
 * and recent hook runs, and can view their output (less) or cancel jobs.
 *
 * Notes:
 * - Esc cancels a running sync hook (commands get ctx.signal); each hook also
 *   has a timeout (default 30s) so a hung hook cannot wedge the agent.
 * - Cancelled detached jobs never wake the agent.
 * - A wake-up queued while the agent is busy cannot be retracted; cancellation
 *   only works while the job is still running.
 * - Output inspection (/hooks view) is TUI-only and never enters model context.
 * - SECURITY: hooks.json commands run with full user privileges on every
 *   matching event. Treat hooks.json like a shell rc file.
 */

import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentToolResult, ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey } from "@earendil-works/pi-tui";
import { Type } from "typebox";

// ── Config ──────────────────────────────────────────────────────────

// Structural match for the tool_result handler's return type (the
// ToolResultEventResult interface is not exported from the package root).
interface ToolResultPatch {
	content?: { type: "text"; text: string }[];
	details?: unknown;
	isError?: boolean;
}

type HookEvent = "tool_call" | "tool_result" | "agent_settled" | "session_start";

interface HookEntry {
	matcher?: string;
	command: string;
	timeoutMs?: number;
}

type HooksConfig = Partial<Record<HookEvent, HookEntry[]>>;

const agentDir = dirname(dirname(fileURLToPath(import.meta.url)));
const configPath = join(agentDir, "hooks.json");

const DEFAULT_HOOK_TIMEOUT_MS = 30_000;
const OUTPUT_CAP_BYTES = 256 * 1024;
const WAKE_OUTPUT_CHARS = 30_000;
const MAX_RECENT_RUNS = 20;

let lastConfigError: string | undefined;

function loadConfig(ctx?: ExtensionContext): HooksConfig {
	try {
		if (!existsSync(configPath)) return {};
		const raw: unknown = JSON.parse(readFileSync(configPath, "utf8"));
		lastConfigError = undefined;
		if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
		return raw as HooksConfig;
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		if (ctx?.hasUI && msg !== lastConfigError) {
			ctx.ui.notify(`hooks.json parse error: ${msg}`, "error");
		}
		lastConfigError = msg;
		return {};
	}
}

function matches(matcher: string | undefined, toolName: string): boolean {
	if (!matcher || !matcher.trim()) return true;
	return matcher.split("|").some((part) => {
		const m = part.trim();
		return m !== "" && (toolName === m || toolName.includes(m));
	});
}

function entriesFor(config: HooksConfig, event: HookEvent, toolName?: string): HookEntry[] {
	const list = config[event];
	if (!Array.isArray(list)) return [];
	return list.filter(
		(e): e is HookEntry =>
			!!e && typeof e === "object" && typeof e.command === "string" &&
			(toolName === undefined || matches(e.matcher, toolName)),
	);
}

// ── Helpers ─────────────────────────────────────────────────────────

function tailCap(s: string, cap: number): string {
	return s.length > cap ? s.slice(s.length - cap) : s;
}

function firstLine(s: string): string {
	return s.trim().split("\n")[0] ?? "";
}

function truncate(s: string, max: number): string {
	return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function tryParseJson(s: string): unknown {
	try {
		return JSON.parse(s);
	} catch {
		return undefined;
	}
}

function elapsedSeconds(startedAt: number): number {
	return Math.round((Date.now() - startedAt) / 1000);
}

// ── Hook command execution ──────────────────────────────────────────

interface HookRunResult {
	code: number | null;
	stdout: string;
	stderr: string;
	timedOut: boolean;
	aborted: boolean;
	durationMs: number;
}

function runHookCommand(
	entry: HookEntry,
	payload: unknown,
	signal: AbortSignal | undefined,
): Promise<HookRunResult> {
	return new Promise((resolve) => {
		const startedAt = Date.now();
		let stdout = "";
		let stderr = "";
		let timedOut = false;
		let aborted = false;

		const child = spawn("sh", ["-c", entry.command], {
			detached: true,
			stdio: ["pipe", "pipe", "pipe"],
		});
		const stopChild = () => {
			if (child.pid === undefined) return;
			try {
				process.kill(-child.pid, "SIGTERM");
			} catch {
				child.kill("SIGTERM");
			}
		};
		child.stdout.on("data", (d) => {
			stdout = tailCap(stdout + d.toString(), OUTPUT_CAP_BYTES);
		});
		child.stderr.on("data", (d) => {
			stderr = tailCap(stderr + d.toString(), OUTPUT_CAP_BYTES);
		});

		const timeout = setTimeout(() => {
			timedOut = true;
			stopChild();
		}, entry.timeoutMs ?? DEFAULT_HOOK_TIMEOUT_MS);
		const onAbort = () => {
			aborted = true;
			stopChild();
		};
		signal?.addEventListener("abort", onAbort, { once: true });

		const finish = (code: number | null, extraStderr = "") => {
			clearTimeout(timeout);
			signal?.removeEventListener("abort", onAbort);
			resolve({
				code,
				stdout,
				stderr: tailCap(stderr + extraStderr, OUTPUT_CAP_BYTES),
				timedOut,
				aborted,
				durationMs: Date.now() - startedAt,
			});
		};
		child.on("error", (err) => finish(null, `spawn error: ${err.message}`));
		child.on("close", (code) => finish(code));

		child.stdin.write(JSON.stringify(payload));
		child.stdin.end();
	});
}

// ── Recent hook runs (for /hooks inspection) ────────────────────────

interface HookRun {
	id: number;
	event: HookEvent;
	matcher: string;
	command: string;
	code: number | null;
	stdout: string;
	stderr: string;
	timedOut: boolean;
	startedAt: number;
	durationMs: number;
	blocked: boolean;
}

const recentRuns: HookRun[] = [];
let nextRunId = 1;

function recordRun(
	event: HookEvent,
	entry: HookEntry,
	result: HookRunResult,
	blocked: boolean,
): void {
	recentRuns.push({
		id: nextRunId++,
		event,
		matcher: entry.matcher ?? "",
		command: entry.command,
		code: result.code,
		stdout: result.stdout,
		stderr: result.stderr,
		timedOut: result.timedOut,
		startedAt: Date.now() - result.durationMs,
		durationMs: result.durationMs,
		blocked,
	});
	if (recentRuns.length > MAX_RECENT_RUNS) recentRuns.shift();
}

// ── Detached jobs ───────────────────────────────────────────────────

interface OutputSegment {
	err: boolean;
	text: string;
}

interface Job {
	id: number;
	command: string;
	proc: ChildProcess;
	startedAt: number;
	endedAt?: number;
	exitCode?: number | null;
	exitSignal?: string | null;
	cancelled: boolean;
	segments: OutputSegment[];
	size: number;
	logFile: string;
}

const jobs = new Map<number, Job>();
let nextJobId = 1;

const logDir = join(tmpdir(), `pi-hooks-${process.pid}`);
let logDirReady = false;

function ensureLogDir(): void {
	if (!logDirReady) {
		mkdirSync(logDir, { recursive: true });
		logDirReady = true;
	}
}

function appendChunk(job: Job, err: boolean, text: string): void {
	job.segments.push({ err, text });
	job.size += text.length;
	while (job.size > OUTPUT_CAP_BYTES && job.segments.length > 1) {
		const dropped = job.segments.shift();
		if (dropped) job.size -= dropped.text.length;
	}
	// Tee to the per-job log file (stderr in red) for the /hooks pager view.
	try {
		appendFileSync(job.logFile, err ? `\x1b[31m${text}\x1b[0m` : text);
	} catch {
		// Log file is best-effort; the in-memory buffer is authoritative.
	}
}

function combinedOutput(job: Job, maxChars: number): string {
	return tailCap(job.segments.map((s) => s.text).join(""), maxChars);
}

function runningJobs(): Job[] {
	return [...jobs.values()].filter((j) => j.endedAt === undefined);
}

function killJobTree(job: Job): void {
	const pid = job.proc.pid;
	if (pid === undefined) return;
	try {
		process.kill(-pid, "SIGTERM");
	} catch {
		// Already dead.
	}
	setTimeout(() => {
		try {
			process.kill(-pid, "SIGKILL");
		} catch {
			// Already dead.
		}
	}, 2000).unref();
}

// ── Extension ───────────────────────────────────────────────────────

export default function hooks(pi: ExtensionAPI) {
	let uiCtx: ExtensionContext | undefined;

	function updateStatus(): void {
		if (!uiCtx?.hasUI) return;
		const n = runningJobs().length;
		uiCtx.ui.setStatus("hooks", n > 0 ? `⏳ ${n} detached` : undefined);
	}

	function startJob(command: string): Job {
		ensureLogDir();
		const id = nextJobId++;
		const proc = spawn("sh", ["-c", command], {
			detached: true,
			stdio: ["ignore", "pipe", "pipe"],
		});
		const job: Job = {
			id,
			command,
			proc,
			startedAt: Date.now(),
			cancelled: false,
			segments: [],
			size: 0,
			logFile: join(logDir, `job-${id}.log`),
		};
		jobs.set(id, job);

		proc.stdout?.on("data", (d) => appendChunk(job, false, d.toString()));
		proc.stderr?.on("data", (d) => appendChunk(job, true, d.toString()));
		proc.on("error", (err) => appendChunk(job, true, `spawn error: ${err.message}\n`));
		proc.on("close", (code, signal) => {
			job.endedAt = Date.now();
			job.exitCode = code;
			job.exitSignal = signal;
			updateStatus();
			if (job.cancelled) {
				jobs.delete(id);
				if (uiCtx?.hasUI) uiCtx.ui.notify(`Detached job #${id} cancelled`, "info");
				return;
			}
			wake(job);
		});
		proc.unref();

		updateStatus();
		return job;
	}

	function wake(job: Job): void {
		const status = job.exitCode !== null && job.exitCode !== undefined
			? `exit code ${job.exitCode}`
			: `signal ${job.exitSignal}`;
		const output = combinedOutput(job, WAKE_OUTPUT_CHARS);
		try {
			pi.sendMessage(
				{
					customType: "hooks",
					content:
						`Detached job #${job.id} finished (${status}).\n` +
						`Command: ${job.command}\n` +
						`Output:\n${output.trim() || "(no output)"}`,
					display: true,
					details: { jobId: job.id, exitCode: job.exitCode, command: job.command },
				},
				{ triggerTurn: true },
			);
		} catch (err) {
			if (uiCtx?.hasUI) {
				uiCtx.ui.notify(`Detached job #${job.id} finished (${status}) but wake-up failed: ${err}`, "warning");
			}
		}
	}

	function cancelJob(job: Job): boolean {
		if (job.endedAt !== undefined) return false;
		job.cancelled = true;
		killJobTree(job);
		return true;
	}

	// ── Part 1: declarative hooks ────────────────────────────────────

	pi.on("session_start", async (_event, ctx) => {
		uiCtx = ctx;
		await runPassiveHooks("session_start", ctx);
	});

	pi.on("agent_settled", async (_event, ctx) => {
		await runPassiveHooks("agent_settled", ctx);
	});

	async function runPassiveHooks(event: HookEvent, ctx: ExtensionContext): Promise<void> {
		const hooks = entriesFor(loadConfig(ctx), event);
		for (const entry of hooks) {
			const payload = { hook_event_name: event, cwd: ctx.cwd };
			const result = await runHookCommand(entry, payload, ctx.signal);
			recordRun(event, entry, result, false);
			if (result.aborted) return;
			if (result.code !== 0) {
				notifyHookFailure(ctx, event, entry, result);
				continue;
			}
			const out = result.stdout.trim();
			if (out) {
				pi.sendMessage(
					{ customType: "hooks", content: out, display: true },
					{ triggerTurn: false, deliverAs: "nextTurn" },
				);
			}
		}
	}

	function notifyHookFailure(
		ctx: ExtensionContext,
		event: HookEvent,
		entry: HookEntry,
		result: HookRunResult,
	): void {
		if (!ctx.hasUI) return;
		const why = result.timedOut
			? `timed out after ${entry.timeoutMs ?? DEFAULT_HOOK_TIMEOUT_MS}ms`
			: `exit ${result.code}: ${firstLine(result.stderr) || "(no stderr)"}`;
		ctx.ui.notify(`${event} hook failed — ${why}\n${truncate(entry.command, 80)}`, "warning");
	}

	pi.on("tool_call", async (event, ctx) => {
		const hooks = entriesFor(loadConfig(ctx), "tool_call", event.toolName);
		if (hooks.length === 0) return;

		for (const entry of hooks) {
			const payload = {
				hook_event_name: "PreToolUse",
				tool_name: event.toolName,
				tool_input: event.input,
				tool_call_id: event.toolCallId,
				cwd: ctx.cwd,
			};
			const result = await runHookCommand(entry, payload, ctx.signal);
			if (result.aborted) {
				recordRun("tool_call", entry, result, false);
				return; // Esc: the turn is already being aborted.
			}

			let blockReason: string | undefined;
			if (result.code === 2) {
				blockReason = result.stderr.trim() || result.stdout.trim() || `Blocked by hook: ${entry.command}`;
			} else if (result.code === 0) {
				const json = tryParseJson(result.stdout);
				if (json && typeof json === "object" && (json as { block?: unknown }).block === true) {
					blockReason = String((json as { reason?: unknown }).reason ?? `Blocked by hook: ${entry.command}`);
				}
			}
			recordRun("tool_call", entry, result, blockReason !== undefined);

			if (blockReason !== undefined) {
				return { block: true, reason: blockReason };
			}
			if (result.code !== 0 && result.code !== null) {
				notifyHookFailure(ctx, "tool_call", entry, result);
			}
		}
	});

	pi.on("tool_result", async (event, ctx) => {
		const hooks = entriesFor(loadConfig(ctx), "tool_result", event.toolName);
		if (hooks.length === 0) return;

		let patch: ToolResultPatch | undefined;
		for (const entry of hooks) {
			const payload = {
				hook_event_name: "PostToolUse",
				tool_name: event.toolName,
				tool_input: event.input,
				tool_call_id: event.toolCallId,
				content: event.content,
				is_error: event.isError,
				cwd: ctx.cwd,
			};
			const result = await runHookCommand(entry, payload, ctx.signal);
			recordRun("tool_result", entry, result, false);
			if (result.aborted) return;
			if (result.code !== 0) {
				notifyHookFailure(ctx, "tool_result", entry, result);
				continue;
			}
			const json = tryParseJson(result.stdout);
			if (!json || typeof json !== "object" || Array.isArray(json)) continue;

			const j = json as Record<string, unknown>;
			const p: ToolResultPatch = {};
			if (typeof j.content === "string") p.content = [{ type: "text", text: j.content }];
			else if (Array.isArray(j.content)) p.content = j.content as ToolResultPatch["content"];
			if ("details" in j) p.details = j.details;
			if (typeof j.isError === "boolean") p.isError = j.isError;
			if (Object.keys(p).length > 0) patch = { ...patch, ...p };
		}
		return patch;
	});

	// ── Part 2: run_detached tool ────────────────────────────────────

	pi.registerTool({
		name: "run_detached",
		label: "Run Detached",
		description:
			"Run a shell command detached in the background. Returns immediately with a job id; " +
			"when the command exits, its exit code and output tail are delivered as a follow-up message. " +
			"The user can inspect live output or cancel the job at any time with the /hooks command.",
		promptSnippet: "Run long shell commands in the background; get woken with their output when they finish",
		promptGuidelines: [
			"Use run_detached for commands expected to run long (builds, test suites, dev servers, watchers) instead of a blocking bash call.",
			"After run_detached returns, end your turn — you will be woken with the command's exit code and output when it finishes.",
			"Tell the user they can run /hooks to watch the detached command's output or cancel it.",
		],
		parameters: Type.Object({
			command: Type.String({ description: "Shell command to run detached" }),
		}),

		async execute(_toolCallId, params, signal): Promise<AgentToolResult<{ jobId?: number; command: string }>> {
			if (signal?.aborted) {
				return { content: [{ type: "text", text: "Cancelled" }], details: { command: params.command } };
			}
			const job = startJob(params.command);
			return {
				content: [
					{
						type: "text",
						text:
							`Started detached job #${job.id}. You will receive its exit code and output ` +
							"as a follow-up message when it completes. End your turn now unless you have " +
							"other independent work. The user can run /hooks to watch output or cancel the job.",
					},
				],
				details: { jobId: job.id, command: job.command },
			};
		},
	});

	// ── /hooks command ───────────────────────────────────────────────

	pi.registerCommand("hooks", {
		description: "Detached jobs & hook runs: view output, cancel jobs. Usage: /hooks [cancel <id|all>]",
		handler: async (args, ctx) => {
			uiCtx = ctx;
			const parts = args.trim().split(/\s+/).filter(Boolean);

			if (parts[0] === "cancel") {
				handleCancel(ctx, parts[1]);
				return;
			}

			const entries: Array<{ job: Job } | { run: HookRun }> = [
				...[...jobs.values()].sort((a, b) => a.id - b.id).map((job) => ({ job })),
				...recentRuns.slice(-10).reverse().map((run) => ({ run })),
			];
			if (entries.length === 0) {
				ctx.ui.notify("No detached jobs or hook runs yet", "info");
				return;
			}
			if (ctx.mode !== "tui") {
				ctx.ui.notify(`Jobs: ${runningJobs().length} running, ${jobs.size} total. Hook runs: ${recentRuns.length}.`, "info");
				return;
			}

			const choice = await ctx.ui.custom<number | null>((tui, theme, _kb, done) => {
				let selected = 0;
				let notice = "";
				const refresh = () => tui.requestRender();
				const label = (entry: { job: Job } | { run: HookRun }) => {
					if ("job" in entry) {
						const { job } = entry;
						const state = job.endedAt !== undefined
							? job.cancelled
								? "✕ cancelled"
								: `✓ exit ${job.exitCode ?? job.exitSignal}`
							: job.cancelled
								? "✕ cancelling"
								: `⏳ ${elapsedSeconds(job.startedAt)}s`;
						return `job #${job.id}  ${state}  ${job.command}`;
					}
					const { run } = entry;
					const status = run.timedOut ? "timeout" : `exit ${run.code ?? "?"}`;
					return `hook run #${run.id}  ${run.event}${run.blocked ? " [blocked]" : ""} → ${status}  ${run.command}`;
				};

				return {
					render(width: number) {
						const max = Math.max(20, width - 2);
						return [
							theme.bold("Hooks"),
							theme.fg("dim", "↑/↓ select   Enter view output   x cancel selected job   Esc close"),
							...(notice ? [theme.fg("warning", notice)] : []),
							...entries.map((entry, index) => {
								const prefix = index === selected ? theme.fg("accent", "› ") : "  ";
								return prefix + truncate(label(entry), max);
							}),
						];
					},
					invalidate() {},
					handleInput(data: string) {
						if (matchesKey(data, Key.escape)) {
							done(null);
							return;
						}
						if (matchesKey(data, Key.up)) {
							selected = (selected - 1 + entries.length) % entries.length;
							refresh();
							return;
						}
						if (matchesKey(data, Key.down)) {
							selected = (selected + 1) % entries.length;
							refresh();
							return;
						}
						if (matchesKey(data, Key.enter)) {
							done(selected);
							return;
						}
						if (data === "x") {
							const entry = entries[selected];
							if (!("job" in entry) || entry.job.endedAt !== undefined || entry.job.cancelled) {
								notice = "Only a running job can be cancelled.";
							} else {
								cancelJob(entry.job);
								notice = `Cancelling detached job #${entry.job.id}…`;
							}
							refresh();
						}
					},
				};
			});
			if (choice === null) return;
			const entry = entries[choice];
			if ("job" in entry) await viewFile(ctx, entry.job.logFile, entry.job.endedAt === undefined);
			else await viewRun(ctx, entry.run);
		},
	});

	function handleCancel(ctx: ExtensionContext, target: string | undefined): void {
		const running = runningJobs();
		if (!target) {
			ctx.ui.notify("Usage: /hooks cancel <id|all>", "warning");
			return;
		}
		if (target === "all") {
			for (const job of running) cancelJob(job);
			ctx.ui.notify(`Cancelled ${running.length} detached job(s)`, "info");
			return;
		}
		const id = Number(target);
		const job = jobs.get(id);
		if (!job || job.endedAt !== undefined) {
			ctx.ui.notify(`No running detached job #${target}`, "warning");
			return;
		}
		cancelJob(job);
		ctx.ui.notify(`Cancelling detached job #${id}…`, "info");
	}

	/** Open a file in less, taking over the terminal. `follow` uses less +F for live tail. */
	async function viewFile(ctx: ExtensionContext, file: string, follow: boolean): Promise<void> {
		if (ctx.mode !== "tui") {
			ctx.ui.notify("Output viewing requires interactive TUI mode", "warning");
			return;
		}
		if (!existsSync(file)) {
			ctx.ui.notify("No output yet", "info");
			return;
		}
		await ctx.ui.custom((tui, _theme, _kb, done) => {
			tui.stop();
			process.stdout.write("\x1b[2J\x1b[H");
			const args = follow ? ["-R", "+F", file] : ["-R", file];
			spawnSync("less", args, { stdio: "inherit" });
			tui.start();
			tui.requestRender(true);
			done(null);
			return { render: () => [], invalidate: () => {} };
		});
	}

	function viewRun(ctx: ExtensionContext, run: HookRun): Promise<void> {
		ensureLogDir();
		const file = join(logDir, `run-${run.id}.log`);
		const header =
			`hook run #${run.id} — ${run.event} (matcher: ${run.matcher || "*"})\n` +
			`command: ${run.command}\n` +
			`exit: ${run.code ?? "?"}${run.timedOut ? " (timeout)" : ""}  duration: ${run.durationMs}ms` +
			`${run.blocked ? "  BLOCKED the tool call" : ""}\n` +
			"── stdout ──────────────────────────────────────────\n";
		const body = `${run.stdout || "(empty)"}\n── stderr ──────────────────────────────────────────\n${run.stderr || "(empty)"}\n`;
		try {
			writeFileSync(file, header + body);
		} catch (err) {
			ctx.ui.notify(`Could not write run log: ${err}`, "error");
			return Promise.resolve();
		}
		return viewFile(ctx, file, false);
	}

	// ── Shutdown cleanup ─────────────────────────────────────────────

	pi.on("session_shutdown", async () => {
		for (const job of runningJobs()) {
			job.cancelled = true; // Never wake during shutdown.
			killJobTree(job);
		}
		try {
			rmSync(logDir, { recursive: true, force: true });
		} catch {
			// Best effort.
		}
	});
}
