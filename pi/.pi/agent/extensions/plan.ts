/**
 * plan — a read-only planning mode backed by one Markdown document per session.
 *
 * /plan toggles planning mode. The model can only change the plan through the
 * plan_read, plan_write, and plan_edit tools; project writes and mutating bash
 * commands remain blocked. The document is kept outside the working tree at
 * ~/.pi/agent/plans/<session-id>.md, so it never creates a repository PLAN.md.
 */

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Type } from "typebox";
import { Container } from "@earendil-works/pi-tui";
import {
	CONFIG_DIR_NAME,
	getAgentDir,
	type ExtensionAPI,
	type ExtensionCommandContext,
	type ExtensionContext,
	withFileMutationQueue,
} from "@earendil-works/pi-coding-agent";
import { planFileFor, SessionPlanStore } from "./plan/store.ts";

const CUSTOM_TYPE = "plan-mode";
const PLAN_CLEARED_NOTICE = "NOTICE: the plan was cleared.";
const EXEC_HANDOFF_TYPE = "plan-mode-exec";

type PlanState = {
	active: boolean;
};

type LegacyPlanState = PlanState & {
	planFile?: unknown;
};

type ExecHandoff = {
	provider: string;
	modelId: string;
	thinkingLevel?: ReturnType<ExtensionAPI["getThinkingLevel"]>;
};

// --- Bash guard (denylist: guardrails against accidental mutation, not a sandbox) ---

const BLOCKED_BASH: Array<{ pattern: RegExp; label: string }> = [
	{
		pattern: /(?<![\d&\-=])>{1,2}(?![&=])/,
		label: "file redirect",
	},
	{
		pattern:
			/\b(rm|rmdir|mv|cp|mkdir|touch|chmod|chown|chgrp|ln|tee|truncate|dd|shred|rsync|scp)\b/,
		label: "filesystem mutation",
	},
	{ pattern: /\bsed\s+(-\w*i\w*|\S+\s+-i)\b/, label: "in-place sed" },
	{ pattern: /\b(vim?|nvim|nano|emacs)\b/, label: "editor" },
	{
		pattern:
			/\bgit\s+(add|commit|push|pull|merge|rebase|reset|checkout|restore|switch|stash|cherry-pick|revert|tag|init|clone|apply|am|clean|worktree|fetch)\b/,
		label: "git write operation",
	},
	{ pattern: /\bgit\s+branch\s+(-[dD]\b|--delete|--move|-m\b|-M\b)/, label: "git branch mutation" },
	{ pattern: /\bgit\s+config\s+(?!(--get|--list|-l\b))/, label: "git config write" },
	{
		pattern:
			/\b(npm|pnpm|yarn|bun)\s+(install|i|add|remove|uninstall|rm|update|upgrade|ci|link|publish)\b/,
		label: "package manager mutation",
	},
	{ pattern: /\b(pip3?|uv)\s+(pip\s+)?(install|uninstall)\b/, label: "package manager mutation" },
	{
		pattern: /\bbrew\s+(install|uninstall|upgrade|reinstall)\b/,
		label: "package manager mutation",
	},
	{
		pattern: /\bapt(-get)?\s+(install|remove|purge|update|upgrade)\b/,
		label: "package manager mutation",
	},
	{ pattern: /\b(sudo|su|shutdown|reboot|launchctl)\b/, label: "system mutation" },
	{ pattern: /\bsystemctl\s+(start|stop|restart|enable|disable)\b/, label: "system mutation" },
	{
		pattern:
			/\bgh\s+(pr\s+(create|merge|close|reopen|edit|ready)|issue\s+(create|close|reopen|edit)|repo\s+(create|delete|fork)|release\s+(create|delete|edit)|workflow\s+(run|enable|disable))/,
		label: "remote mutation via gh",
	},
	{
		pattern:
			/\bkubectl\s+(apply|create|delete|edit|patch|replace|scale|rollout\s+(restart|undo)|drain|cordon|uncordon|taint|label|annotate)\b/,
		label: "cluster mutation via kubectl",
	},
];

function checkBash(command: string): { safe: boolean; reason?: string } {
	const cmd = command.replace(/'[^']*'|"[^"]*"/g, "").replace(/\\\n\s*/g, " ");
	for (const { pattern, label } of BLOCKED_BASH) {
		if (pattern.test(cmd)) {
			return {
				safe: false,
				reason: `Plan mode: blocked (${label}). Read-only commands are fine — exit plan mode with /plan to run this.`,
			};
		}
	}
	return { safe: true };
}

function buildPlanPrompt(): string {
	return `[PLAN MODE ACTIVE]
You are in plan mode: a read-only working mode whose only output is the session plan. The user wants to converge on a plan with you through back-and-forth discussion BEFORE anything is implemented.

Restrictions (enforced — blocked tool calls will fail):
- File modifications are disabled. Maintain the session plan exclusively through plan_read, plan_write, and plan_edit; never use write or edit for planning.
- Bash commands that mutate the filesystem, system state, git, packages, or remotes are blocked. Read-only commands and CLIs are fully available: searching the codebase, git status/log/diff/show, gh/kubectl reads, curl and web searches, running tests, linters, and type checks.
- All other tools (grep, find, ls, read, memory, questionnaire, subagents) work normally. Only launch read-only (scout/review) subagents — their file edits are not blocked by this mode.

Process:
1. Understand the ask before writing anything. Ask clarifying questions when there are explicit choices. Push back on weak assumptions and name trade-offs.
2. Research before planning. Explore the codebase with read-only tools, check git history, query external sources, and delegate deep dives when that saves time.
3. Use plan_read before refining an existing plan. Structure the plan as: Context & goal; Current state; Approach (including alternatives considered); numbered, verifiable Steps; Open questions & risks.
4. Treat the session plan as a living document: replace stale sections instead of appending history, and keep it tight and current.
5. Do NOT start executing the plan. The user exits plan mode with /plan once the plan is ready.

Rules:
- Write the plan so an executor with zero conversation context can follow it: name concrete paths and symbols, not vague areas.
- Every step must be independently verifiable.
- If the task is trivial, say so and propose skipping the plan instead of writing a bloated one.`;
}

function buildPlanReminder(): string {
	return `[PLAN MODE ACTIVE]
This turn is read-only: research and discuss, do not implement. Project file writes and mutating bash commands are blocked. Keep the session plan current using plan_read, plan_write, and plan_edit; do not start executing it. The user exits plan mode with /plan once the plan is ready.`;
}

async function readConfiguredEditor(settingsFile: string): Promise<string | undefined> {
	try {
		const settings = JSON.parse(await readFile(settingsFile, "utf8")) as {
			externalEditor?: unknown;
		};
		return typeof settings.externalEditor === "string" && settings.externalEditor.trim()
			? settings.externalEditor
			: undefined;
	} catch {
		return undefined;
	}
}

async function editorFor(ctx: ExtensionContext): Promise<string> {
	let editor = await readConfiguredEditor(join(getAgentDir(), "settings.json"));
	if (ctx.isProjectTrusted()) {
		editor =
			(await readConfiguredEditor(join(ctx.cwd, CONFIG_DIR_NAME, "settings.json"))) ?? editor;
	}
	return (
		editor ??
		process.env.VISUAL ??
		process.env.EDITOR ??
		(process.platform === "win32" ? "notepad" : "nano")
	);
}

async function openInEditor(command: string, file: string): Promise<void> {
	const [editor, ...args] = command.split(" ");
	if (!editor) throw new Error("No external editor is configured.");
	const exitCode = await new Promise<number | null>((resolve) => {
		const child = spawn(editor, [...args, file], {
			stdio: "inherit",
			shell: process.platform === "win32",
		});
		child.on("error", () => resolve(null));
		child.on("close", (code) => resolve(code));
	});
	if (exitCode !== 0) throw new Error(`Editor exited with ${exitCode ?? "an error"}.`);
}

export default function planExtension(pi: ExtensionAPI) {
	let state: PlanState = { active: false };
	let store: SessionPlanStore | undefined;

	function currentStore(ctx: ExtensionContext): SessionPlanStore {
		const file = planFileFor(ctx.sessionManager.getSessionId(), getAgentDir());
		if (!store || store.file !== file) store = new SessionPlanStore(file, withFileMutationQueue);
		return store;
	}

	function persist(): void {
		pi.appendEntry(CUSTOM_TYPE, state);
	}

	function updateUI(ctx: ExtensionContext): void {
		ctx.ui.setStatus("plan-mode", state.active ? ctx.ui.theme.fg("warning", "⏸ plan") : undefined);
	}

	async function enable(ctx: ExtensionContext): Promise<void> {
		state = { active: true };
		persist();
		updateUI(ctx);
		ctx.ui.notify("Plan mode ON — project changes are blocked. /plan to exit.", "info");
	}

	async function disable(ctx: ExtensionContext): Promise<void> {
		const commandCtx = ctx as ExtensionCommandContext;
		const canNewSession = typeof commandCtx.newSession === "function";
		let action: "execute" | "execute-fresh" | "exit" = "exit";
		if (ctx.hasUI) {
			const options = ["Execute the plan"];
			if (canNewSession) options.push("Clear context and execute the plan");
			options.push("Exit plan mode");
			const choice = await ctx.ui.select("Exit plan mode", options);
			if (choice === undefined) return;
			action =
				choice === "Execute the plan"
					? "execute"
					: choice.startsWith("Clear context")
						? "execute-fresh"
						: "exit";
		}

		const parentSession = ctx.sessionManager.getSessionFile();
		state = { active: false };
		persist();
		updateUI(ctx);
		ctx.ui.notify("Plan mode OFF — full access restored.", "info");
		const kickoff =
			"Plan mode is over. Use plan_read to review the session plan, then execute it step by step and verify each step before moving on.";
		if (action === "execute") {
			pi.sendUserMessage(kickoff);
		} else if (action === "execute-fresh" && canNewSession) {
			const handoff: ExecHandoff | undefined = ctx.model
				? {
						provider: ctx.model.provider,
						modelId: ctx.model.id,
						thinkingLevel: pi.getThinkingLevel(),
					}
				: undefined;
			await commandCtx.newSession({
				parentSession,
				setup: async (sm) => {
					if (handoff) sm.appendCustomEntry(EXEC_HANDOFF_TYPE, handoff);
				},
				withSession: async (newCtx) => {
					await newCtx.sendUserMessage(kickoff);
				},
			});
		}
	}

	async function clear(ctx: ExtensionContext): Promise<void> {
		await currentStore(ctx).write("");
		pi.sendMessage(
			{ customType: "plan-mode-notice", content: PLAN_CLEARED_NOTICE, display: true },
			{ triggerTurn: false },
		);
		ctx.ui.notify("Plan cleared.", "info");
	}

	async function open(ctx: ExtensionContext): Promise<void> {
		if (ctx.mode !== "tui") {
			ctx.ui.notify("/plan open is only available in interactive mode.", "warning");
			return;
		}
		const planStore = currentStore(ctx);
		await planStore.write(await planStore.read());
		let error: Error | undefined;
		await ctx.ui.custom<void>((tui, _theme, _keybindings, done) => {
			void (async () => {
				tui.stop();
				try {
					await openInEditor(await editorFor(ctx), planStore.file);
				} catch (caught: unknown) {
					error = caught instanceof Error ? caught : new Error(String(caught));
				} finally {
					tui.start();
					tui.requestRender(true);
					done();
				}
			})();
			return new Container();
		});
		ctx.ui.notify(
			error ? `Could not open plan: ${error.message}` : "Plan closed.",
			error ? "error" : "info",
		);
	}

	async function toggle(ctx: ExtensionContext, args?: string): Promise<void> {
		const arg = args?.trim();
		if (arg === "open") return open(ctx);
		if (arg === "clear" || arg === "new") return clear(ctx);
		if (state.active) {
			if (arg && arg !== "off") {
				ctx.ui.notify("Already in plan mode. Use /plan (or /plan off) to exit.", "warning");
				return;
			}
			return disable(ctx);
		}
		if (arg === "off") {
			ctx.ui.notify("Plan mode is not active.", "info");
			return;
		}
		if (arg && arg !== "on") {
			ctx.ui.notify("Usage: /plan [on|off|open|clear|new]", "warning");
			return;
		}
		return enable(ctx);
	}

	pi.registerFlag("plan", {
		description: "Start in plan mode (read-only; session-scoped Markdown plan)",
		type: "boolean",
		default: false,
	});

	pi.registerCommand("plan", {
		description: "Toggle plan mode; /plan open, /plan clear, or /plan new manage its session plan",
		handler: async (args, ctx) => toggle(ctx, args),
	});

	pi.registerShortcut("ctrl+alt+p", {
		description: "Toggle plan mode",
		handler: async (ctx) => toggle(ctx),
	});

	pi.registerTool({
		name: "plan_read",
		label: "Plan Read",
		description:
			"Read the Markdown plan scoped to this Pi session. Returns an empty-plan notice when none exists.",
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			const content = await currentStore(ctx).read();
			return {
				content: [{ type: "text", text: content || "The session plan is empty." }],
				details: { empty: content.length === 0 },
			};
		},
	});

	pi.registerTool({
		name: "plan_write",
		label: "Plan Write",
		description:
			"Replace the complete Markdown plan scoped to this Pi session. Use only to maintain the plan, never project files.",
		parameters: Type.Object({
			content: Type.String({ description: "Complete replacement Markdown document" }),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			await currentStore(ctx).write(params.content);
			return {
				content: [{ type: "text", text: "Updated the session plan." }],
				details: { bytes: Buffer.byteLength(params.content) },
			};
		},
	});

	pi.registerTool({
		name: "plan_edit",
		label: "Plan Edit",
		description:
			"Edit one unique exact text region in the Markdown plan scoped to this Pi session. Read the plan first when uncertain.",
		parameters: Type.Object({
			oldText: Type.String({ description: "Unique exact text to replace" }),
			newText: Type.String({ description: "Replacement text" }),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if (params.oldText.length === 0) throw new Error("oldText must not be empty.");
			await currentStore(ctx).edit(params.oldText, params.newText);
			return {
				content: [{ type: "text", text: "Updated the session plan." }],
				details: {},
			};
		},
	});

	pi.on("tool_call", async (event, ctx) => {
		if (!state.active) return;
		if (event.toolName === "write" || event.toolName === "edit") {
			return {
				block: true,
				reason:
					"Plan mode: project file modifications are disabled. Use plan_write or plan_edit to maintain the session plan, or exit with /plan to modify files.",
			};
		}
		if (event.toolName === "bash") {
			const result = checkBash((event.input as { command: string }).command);
			if (!result.safe) return { block: true, reason: result.reason };
		}
	});

	pi.on("before_agent_start", async (event) => {
		if (!state.active) return;
		return { systemPrompt: event.systemPrompt + "\n\n" + buildPlanPrompt() };
	});

	pi.on("context", async (event) => {
		if (!state.active) return;
		const target = event.messages.findLast((message) => message.role === "user");
		if (target?.role !== "user") return;
		const reminder = { type: "text" as const, text: buildPlanReminder() };
		target.content =
			typeof target.content === "string"
				? [{ type: "text", text: target.content }, reminder]
				: [...target.content, reminder];
		return { messages: event.messages };
	});

	pi.on("session_start", async (event, ctx) => {
		store = new SessionPlanStore(
			planFileFor(ctx.sessionManager.getSessionId(), getAgentDir()),
			withFileMutationQueue,
		);
		if (pi.getFlag("plan") === true) state = { active: true };

		let legacyPlanFile: string | undefined;
		for (const entry of ctx.sessionManager.getBranch()) {
			if (
				entry.type === "custom" &&
				(entry as { customType?: string }).customType === CUSTOM_TYPE
			) {
				const data = (entry as { data?: LegacyPlanState }).data;
				if (!data) continue;
				state = { active: data.active ?? false };
				if (typeof data.planFile === "string") legacyPlanFile = data.planFile;
			}
		}

		if (state.active && legacyPlanFile && !(await currentStore(ctx).read())) {
			try {
				await currentStore(ctx).write(await readFile(legacyPlanFile, "utf8"));
				ctx.ui.notify("Migrated this session's existing plan into the session plan store.", "info");
			} catch {
				// The old plan file was optional and may no longer exist.
			}
		}

		if (event.reason === "new") {
			for (const entry of ctx.sessionManager.getBranch()) {
				if (
					entry.type !== "custom" ||
					(entry as { customType?: string }).customType !== EXEC_HANDOFF_TYPE
				)
					continue;
				const handoff = (entry as { data?: ExecHandoff }).data;
				if (!handoff?.provider || !handoff.modelId) continue;
				const model = ctx.modelRegistry.find(handoff.provider, handoff.modelId);
				if (model && (await pi.setModel(model))) {
					if (handoff.thinkingLevel) pi.setThinkingLevel(handoff.thinkingLevel);
				} else if (model) {
					ctx.ui.notify(
						`plan: no API key for ${handoff.provider}/${handoff.modelId} — staying on the default model.`,
						"warning",
					);
				}
			}
		}

		updateUI(ctx);
	});
}
