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
 * and recent hook runs, and pages through their output or cancels jobs.
 *
 * Notes:
 * - Esc cancels a running sync hook (commands get ctx.signal); each hook also
 *   has a timeout (default 30s) so a hung hook cannot wedge the agent.
 * - Cancelled detached jobs never wake the agent.
 * - A wake-up queued while the agent is busy cannot be retracted; cancellation
 *   only works while the job is still running.
 * - Output inspection (/hooks view) is TUI-only and never enters model context.
 *   It pages the captured buffer in-process, so it follows a running job live
 *   and never hands the terminal to a child program.
 * - SECURITY: hooks.json commands run with full user privileges on every
 *   matching event. Treat hooks.json like a shell rc file.
 */

import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
	AgentToolResult,
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
	Key,
	matchesKey,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import { Type } from "typebox";
import {
	clampScroll,
	maxScroll,
	type OutputLine,
	type OutputSegment,
	toLines,
} from "./hooks/pager.ts";

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

// nf-md-webhook (U+F062F), present in the installed Symbols Nerd Font.
const HOOKS_ICON = "󰘯";

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
			!!e &&
			typeof e === "object" &&
			typeof e.command === "string" &&
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

function spawnHookCommand(
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
}

const jobs = new Map<number, Job>();
let nextJobId = 1;

// Anything watching /hooks re-renders on change; `generation` lets the pager
// keep its wrapped lines until the underlying output actually moves.
const changeListeners = new Set<() => void>();
let generation = 0;

function notifyChange(): void {
	generation++;
	for (const listener of changeListeners) listener();
}

// A component whose session is replaced is never disposed by the host, so its
// teardown is registered here and also run on shutdown.
const viewerTeardowns = new Set<() => void>();

/**
 * Re-render a /hooks view when output or job state moves, and once a second so
 * elapsed times advance. Returns the teardown, which is safe to call twice.
 */
function liveRefresh(refresh: () => void): () => void {
	changeListeners.add(refresh);
	const ticker = setInterval(refresh, 1000).unref();
	const teardown = () => {
		changeListeners.delete(refresh);
		clearInterval(ticker);
		viewerTeardowns.delete(teardown);
	};
	viewerTeardowns.add(teardown);
	return teardown;
}

function appendChunk(job: Job, err: boolean, text: string): void {
	job.segments.push({ err, text });
	job.size += text.length;
	while (job.size > OUTPUT_CAP_BYTES && job.segments.length > 1) {
		const dropped = job.segments.shift();
		if (dropped) job.size -= dropped.text.length;
	}
	notifyChange();
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

// ── /hooks entries ──────────────────────────────────────────────────

type Entry = { job: Job } | { run: HookRun };

function entries(): Entry[] {
	return [
		...[...jobs.values()].sort((a, b) => a.id - b.id).map((job) => ({ job })),
		...recentRuns
			.slice(-10)
			.reverse()
			.map((run) => ({ run })),
	];
}

function label(entry: Entry): string {
	if ("job" in entry) {
		const { job } = entry;
		const state =
			job.endedAt !== undefined
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
}

/** A finished hook run has no live buffer, so its report is built on demand. */
function runSegments(run: HookRun): OutputSegment[] {
	return [
		{ err: false, text: `matcher: ${run.matcher || "*"}  duration: ${run.durationMs}ms\n\n` },
		{ err: false, text: run.stdout ? run.stdout.replace(/\n*$/, "\n") : "(no stdout)\n" },
		{ err: true, text: run.stderr ? run.stderr.replace(/\n*$/, "\n") : "" },
	];
}

// ── Log box ─────────────────────────────────────────────────────────

// Framing the pager marks where a job's output starts and ends, so a short log
// reads as one block rather than as more rows of the list behind it.

type Paint = (text: string) => string;

/** `╭─ caption ─────╮`, with the caption already coloured by the caller. */
function boxBorder(
	width: number,
	left: string,
	right: string,
	caption: string,
	dim: Paint,
): string {
	if (width < 3) return dim(left);
	const inner = width - 2;
	// Below six cells there is no room for a caption plus its spaces and rules.
	const inlay = inner >= 6 ? ` ${truncateToWidth(caption, inner - 4, "…")} ` : "";
	const fill = "─".repeat(Math.max(0, inner - 1 - visibleWidth(inlay)));
	return `${dim(`${left}─`)}${inlay}${dim(`${fill}${right}`)}`;
}

/** `│ text │`, clipped and padded so the row occupies exactly `width` cells. */
function boxRow(width: number, text: string, dim: Paint): string {
	const inner = width - 4;
	if (inner < 1) return truncateToWidth(text, Math.max(0, width), "…");
	const fit = truncateToWidth(text, inner, "…");
	return `${dim("│")} ${fit}${" ".repeat(inner - visibleWidth(fit))} ${dim("│")}`;
}

// ── Extension ───────────────────────────────────────────────────────

export default function hooks(pi: ExtensionAPI) {
	let uiCtx: ExtensionContext | undefined;

	/**
	 * The UI of the session this instance belongs to, or undefined once that
	 * session is gone. Every property of a replaced ctx throws, and detached
	 * jobs call back from child-process events, where a throw would escape as an
	 * uncaughtException and take Pi down. session_shutdown normally clears the
	 * ctx first; the catch is the backstop for any path that does not.
	 */
	function currentUi(): ExtensionContext["ui"] | undefined {
		try {
			return uiCtx?.hasUI ? uiCtx.ui : undefined;
		} catch {
			uiCtx = undefined;
			return undefined;
		}
	}

	// Hook commands block the turn they fire on, so the count is the honest
	// answer to "what is Pi waiting for?"; detached jobs run alongside it.
	let activeHooks = 0;

	function updateStatus(): void {
		const detached = runningJobs().length;
		const parts: string[] = [];
		if (activeHooks > 0) parts.push(`${activeHooks} hook${activeHooks === 1 ? "" : "s"}`);
		if (detached > 0) parts.push(`${detached} detached`);
		// The statusline extension promotes this key to footer line 1 and colours
		// it there, so the text carries only its own glyph.
		const text = parts.length > 0 ? `${HOOKS_ICON} ${parts.join(", ")}` : undefined;
		currentUi()?.setStatus("hooks", text);
	}

	/** Run a hook command, counting it in the status line while it is in flight. */
	async function runHookCommand(
		entry: HookEntry,
		payload: unknown,
		signal: AbortSignal | undefined,
	): Promise<HookRunResult> {
		activeHooks++;
		updateStatus();
		try {
			return await spawnHookCommand(entry, payload, signal);
		} finally {
			activeHooks--;
			updateStatus();
		}
	}

	function startJob(command: string): Job {
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
				notifyChange();
				currentUi()?.notify(`Detached job #${id} cancelled`, "info");
				return;
			}
			notifyChange();
			wake(job);
		});
		proc.unref();

		updateStatus();
		notifyChange();
		return job;
	}

	function wake(job: Job): void {
		const status =
			job.exitCode !== null && job.exitCode !== undefined
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
			currentUi()?.notify(
				`Detached job #${job.id} finished (${status}) but wake-up failed: ${err}`,
				"warning",
			);
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
		updateStatus(); // Jobs outlive the session that started them.
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
				blockReason =
					result.stderr.trim() || result.stdout.trim() || `Blocked by hook: ${entry.command}`;
			} else if (result.code === 0) {
				const json = tryParseJson(result.stdout);
				if (json && typeof json === "object" && (json as { block?: unknown }).block === true) {
					blockReason = String(
						(json as { reason?: unknown }).reason ?? `Blocked by hook: ${entry.command}`,
					);
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
		promptSnippet:
			"Run long shell commands in the background; get woken with their output when they finish",
		promptGuidelines: [
			"Use run_detached for commands expected to run long (builds, test suites, dev servers, watchers) instead of a blocking bash call.",
			"After run_detached returns, end your turn — you will be woken with the command's exit code and output when it finishes.",
			"Tell the user they can run /hooks to watch the detached command's output or cancel it.",
		],
		parameters: Type.Object({
			command: Type.String({ description: "Shell command to run detached" }),
		}),

		async execute(
			_toolCallId,
			params,
			signal,
		): Promise<AgentToolResult<{ jobId?: number; command: string }>> {
			if (signal?.aborted) {
				return {
					content: [{ type: "text", text: "Cancelled" }],
					details: { command: params.command },
				};
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
		description:
			"Detached jobs & hook runs: view output, cancel jobs. Usage: /hooks [cancel <id|all>]",
		handler: async (args, ctx) => {
			uiCtx = ctx;
			const parts = args.trim().split(/\s+/).filter(Boolean);

			if (parts[0] === "cancel") {
				handleCancel(ctx, parts[1]);
				return;
			}

			if (entries().length === 0) {
				ctx.ui.notify("No detached jobs or hook runs yet", "info");
				return;
			}
			if (ctx.mode !== "tui") {
				ctx.ui.notify(
					`Jobs: ${runningJobs().length} running, ${jobs.size} total. Hook runs: ${recentRuns.length}.`,
					"info",
				);
				return;
			}

			// Closing the pager returns to the list, so it is never a dead end.
			let selected = 0;
			for (;;) {
				const chosen = await browse(ctx, selected);
				if (!chosen) return;
				selected = chosen.index;
				await viewOutput(ctx, chosen.entry);
			}
		},
	});

	/** Job and hook-run picker. Resolves with the chosen entry, or undefined on Esc. */
	function browse(
		ctx: ExtensionContext,
		initial: number,
	): Promise<{ entry: Entry; index: number } | undefined> {
		return ctx.ui.custom<{ entry: Entry; index: number } | undefined>((tui, theme, _kb, done) => {
			let selected = initial;
			let notice = "";
			let cancellingJobId: number | undefined;
			const refresh = () => tui.requestRender();
			const currentEntries = () => {
				const value = entries();
				selected = Math.min(selected, Math.max(0, value.length - 1));
				return value;
			};
			const onChange = () => {
				if (cancellingJobId !== undefined && !jobs.has(cancellingJobId)) {
					cancellingJobId = undefined;
					notice = "";
				}
				refresh();
			};
			const teardown = liveRefresh(onChange);

			return {
				dispose: teardown,
				render(width: number) {
					// Every line must fit the terminal in cells, not characters: job
					// labels carry double-width glyphs and arbitrary command text.
					const fit = (text: string, max = width) => truncateToWidth(text, max, "…");
					const visibleEntries = currentEntries();
					return [
						theme.bold("Hooks"),
						theme.fg(
							"dim",
							fit("↑/↓ select   Enter view output   x cancel selected job   Esc close"),
						),
						...(notice ? [theme.fg("warning", fit(notice))] : []),
						...(visibleEntries.length === 0
							? [theme.fg("dim", fit("No detached jobs or hook runs."))]
							: visibleEntries.map((entry, index) => {
									const prefix = index === selected ? theme.fg("accent", "› ") : "  ";
									return prefix + fit(label(entry), Math.max(1, width - 2));
								})),
					];
				},
				invalidate() {},
				handleInput(data: string) {
					if (matchesKey(data, Key.escape)) {
						done(undefined);
						return;
					}
					const visibleEntries = currentEntries();
					const entry = visibleEntries[selected];
					if (matchesKey(data, Key.up) && visibleEntries.length > 0) {
						selected = (selected - 1 + visibleEntries.length) % visibleEntries.length;
						refresh();
						return;
					}
					if (matchesKey(data, Key.down) && visibleEntries.length > 0) {
						selected = (selected + 1) % visibleEntries.length;
						refresh();
						return;
					}
					if (matchesKey(data, Key.enter) && entry) {
						done({ entry, index: selected });
						return;
					}
					if (matchesKey(data, "x")) {
						if (!entry || !("job" in entry) || entry.job.endedAt !== undefined) {
							notice = "Only a running job can be cancelled.";
						} else if (entry.job.cancelled) {
							notice = `Detached job #${entry.job.id} is already being cancelled.`;
						} else {
							cancelJob(entry.job);
							cancellingJobId = entry.job.id;
							notice = `Cancelling detached job #${entry.job.id}…`;
						}
						refresh();
					}
				},
			};
		});
	}

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

	/** Scrollable pager over an entry's captured output; follows a running job live. */
	async function viewOutput(ctx: ExtensionContext, entry: Entry): Promise<void> {
		const source = "job" in entry ? () => entry.job.segments : () => runSegments(entry.run);
		await ctx.ui.custom<null>((tui, theme, _kb, done) => {
			let scroll = 0;
			let following = true;
			// Both are only known once rendered; input before the first frame is a no-op.
			let viewport = 0;
			let lineCount = 0;
			let cache: { key: string; lines: OutputLine[] } | undefined;
			const dim = (text: string) => theme.fg("dim", text);

			// pi-tui wraps by terminal cells, so wide glyphs in the output cannot
			// push a rendered row past the terminal width.
			const linesFor = (width: number): OutputLine[] => {
				const key = `${width}:${generation}`;
				if (cache?.key !== key) {
					const lines = toLines(source()).flatMap((line) =>
						wrapTextWithAnsi(line.text, width).map((text) => ({ text, err: line.err })),
					);
					cache = { key, lines };
				}
				lineCount = cache.lines.length;
				return cache.lines;
			};
			const scrollTo = (target: number) => {
				scroll = clampScroll(target, lineCount, viewport);
				following = scroll === maxScroll(lineCount, viewport);
				tui.requestRender();
			};
			const teardown = liveRefresh(() => tui.requestRender());

			return {
				dispose: teardown,
				invalidate() {
					cache = undefined;
				},
				render(width: number) {
					// Two border columns plus a space of padding on each side.
					const inner = Math.max(1, width - 4);
					viewport = Math.max(5, tui.terminal.rows - 9);
					const lines = linesFor(inner);
					scroll = following
						? maxScroll(lines.length, viewport)
						: clampScroll(scroll, lines.length, viewport);
					const shown = lines.slice(scroll, scroll + viewport);
					const position =
						lines.length === 0
							? "no output yet"
							: `lines ${scroll + 1}-${scroll + shown.length} of ${lines.length}`;
					// One blank row keeps an empty box from collapsing into two rules.
					const body = shown.length > 0 ? shown : [{ text: "", err: false }];
					return [
						boxBorder(width, "╭", "╮", theme.bold(label(entry)), dim),
						...body.map((line) =>
							boxRow(width, line.err ? theme.fg("error", line.text) : line.text, dim),
						),
						boxBorder(width, "╰", "╯", dim(position + (following ? " · following" : "")), dim),
						dim(truncateToWidth("↑/↓ PgUp/PgDn g/G scroll   Esc close", width, "…")),
					];
				},
				handleInput(data: string) {
					if (matchesKey(data, Key.escape) || matchesKey(data, "q")) done(null);
					else if (matchesKey(data, Key.up) || matchesKey(data, "k")) scrollTo(scroll - 1);
					else if (matchesKey(data, Key.down) || matchesKey(data, "j")) scrollTo(scroll + 1);
					else if (matchesKey(data, Key.pageUp) || matchesKey(data, Key.ctrl("b")))
						scrollTo(scroll - viewport);
					else if (matchesKey(data, Key.pageDown) || matchesKey(data, Key.ctrl("f")))
						scrollTo(scroll + viewport);
					else if (matchesKey(data, Key.home) || matchesKey(data, "g")) scrollTo(0);
					else if (matchesKey(data, Key.end) || matchesKey(data, Key.shift("g")))
						scrollTo(lineCount);
				},
			};
		});
	}

	// ── Shutdown cleanup ─────────────────────────────────────────────

	// Fires on quit and on every session replacement, reload included. The ctx
	// is invalidated right after this returns, while detached children are still
	// exiting, so the UI handle has to be dropped before their close events land.
	pi.on("session_shutdown", async () => {
		uiCtx = undefined;
		for (const teardown of [...viewerTeardowns]) teardown();
		for (const job of runningJobs()) {
			job.cancelled = true; // Never wake during shutdown.
			killJobTree(job);
		}
	});
}
