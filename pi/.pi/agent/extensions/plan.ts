/**
 * plan — read-only planning mode with a PLAN.md carve-out.
 *
 * /plan toggles plan mode. While active:
 * - write/edit are blocked for every file EXCEPT the plan file (default: PLAN.md in cwd)
 * - bash commands that mutate the filesystem, system state, or remotes are blocked;
 *   read-only commands and CLIs (grep, git status/log/diff, gh api, curl, tests, ...) still run
 * - everything else stays available (grep/find/ls/read, subagents, memory, questionnaire)
 *
 * The agent researches, discusses, and maintains a plan in the plan file. Exiting plan
 * mode offers to execute the plan.
 *
 * Inspired by the pi-plan and @dreki-gg/pi-plan-mode packages.
 */

import { existsSync } from "node:fs";
import { basename, resolve } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const CUSTOM_TYPE = "plan-mode";

type PlanState = {
	active: boolean;
	planFile: string; // absolute path
};

// --- Bash guard (denylist: guardrails against accidental mutation, not a sandbox) ---

const BLOCKED_BASH: Array<{ pattern: RegExp; label: string }> = [
	// File redirects (but not 2>&1, >=, ->, =>)
	{ pattern: /(?<![\d&\-=])>{1,2}(?![&=])/, label: "file redirect (use the write tool for PLAN.md)" },
	// Filesystem mutation
	{ pattern: /\b(rm|rmdir|mv|cp|mkdir|touch|chmod|chown|chgrp|ln|tee|truncate|dd|shred|rsync|scp)\b/, label: "filesystem mutation" },
	{ pattern: /\bsed\s+(-\w*i\w*|\S+\s+-i)\b/, label: "in-place sed" },
	// Editors / pagers that can edit
	{ pattern: /\b(vim?|nvim|nano|emacs)\b/, label: "editor" },
	// Git write operations (read-only: status, log, diff, show, branch, ls-*, blame, rev-parse, ...)
	{ pattern: /\bgit\s+(add|commit|push|pull|merge|rebase|reset|checkout|restore|switch|stash|cherry-pick|revert|tag|init|clone|apply|am|clean|worktree|fetch)\b/, label: "git write operation" },
	{ pattern: /\bgit\s+branch\s+(-[dD]\b|--delete|--move|-m\b|-M\b)/, label: "git branch mutation" },
	{ pattern: /\bgit\s+config\s+(?!(--get|--list|-l\b))/, label: "git config write" },
	// Package managers (mutating subcommands only)
	{ pattern: /\b(npm|pnpm|yarn|bun)\s+(install|i|add|remove|uninstall|rm|update|upgrade|ci|link|publish)\b/, label: "package manager mutation" },
	{ pattern: /\b(pip3?|uv)\s+(pip\s+)?(install|uninstall)\b/, label: "package manager mutation" },
	{ pattern: /\bbrew\s+(install|uninstall|upgrade|reinstall)\b/, label: "package manager mutation" },
	{ pattern: /\bapt(-get)?\s+(install|remove|purge|update|upgrade)\b/, label: "package manager mutation" },
	// System state
	{ pattern: /\b(sudo|su|shutdown|reboot|launchctl)\b/, label: "system mutation" },
	{ pattern: /\bsystemctl\s+(start|stop|restart|enable|disable)\b/, label: "system mutation" },
	// Remote mutations via CLIs (local reads stay allowed)
	{ pattern: /\bgh\s+(pr\s+(create|merge|close|reopen|edit|ready)|issue\s+(create|close|reopen|edit)|repo\s+(create|delete|fork)|release\s+(create|delete|edit)|workflow\s+(run|enable|disable))/, label: "remote mutation via gh" },
	{ pattern: /\bkubectl\s+(apply|create|delete|edit|patch|replace|scale|rollout\s+(restart|undo)|drain|cordon|uncordon|taint|label|annotate)\b/, label: "cluster mutation via kubectl" },
];

function checkBash(command: string): { safe: boolean; reason?: string } {
	// Strip quoted strings so search patterns like rg 'a > b' don't trip the redirect rule.
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

// --- System prompt ---

function buildPlanPrompt(planFile: string, exists: boolean): string {
	return `[PLAN MODE ACTIVE]
You are in plan mode: a read-only working mode whose only output is a plan document. The user wants to converge on a plan with you through back-and-forth discussion BEFORE anything is implemented.

Restrictions (enforced — blocked tool calls will fail):
- File modifications are disabled, with ONE exception: you may freely write and edit the plan file at ${planFile}.
- Bash commands that mutate the filesystem, system state, git, packages, or remotes are blocked. Read-only commands and CLIs are fully available: searching the codebase, git status/log/diff/show, gh/kubectl reads, curl and web searches, running tests, linters, and type checks.
- All other tools (grep, find, ls, read, memory, questionnaire, subagents) work normally. Only launch read-only (scout/review) subagents — their file edits are not blocked by this mode.

Process:
1. Understand the ask before writing anything. Ask clarifying questions (use the questionnaire tool when there are explicit choices). Push back on weak assumptions and name trade-offs.
2. Research before planning. Explore the codebase with read-only tools, check git history, query external sources, delegate deep dives to subagents when that saves time.
3. Write the plan into ${basename(planFile)}.${exists ? " The file already exists — read it first and refine it, do not start from scratch." : ""} Structure it as:
   - Context & goal — what and why, in a few sentences
   - Current state — relevant facts discovered during research (file paths, symbols, constraints)
   - Approach — the chosen approach and the alternatives considered, with reasons
   - Steps — numbered and ordered; each step names the files/areas it touches and how to verify it (command, test, observable outcome)
   - Open questions & risks
4. Iterate. Treat ${basename(planFile)} as a living document: update it as the discussion evolves, rewrite sections rather than appending, and keep it tight and current.
5. Do NOT start executing the plan. When the user is satisfied they will exit plan mode with /plan and run it themselves (or ask you to).

Rules:
- NEVER modify any file other than ${basename(planFile)} — not even a one-line typo fix.
- Write the plan so an executor with zero conversation context could follow it: concrete file paths and symbol names, not vague descriptions.
- Every step must be independently verifiable.
- If the task turns out to be trivial, say so and propose skipping the plan instead of writing a bloated one.`;
}

// --- Extension ---

export default function planExtension(pi: ExtensionAPI) {
	let state: PlanState = { active: false, planFile: "" };

	function planFileFor(cwd: string, pathArg?: string): string {
		return resolve(cwd, pathArg?.trim() || "PLAN.md");
	}

	function persist(): void {
		pi.appendEntry(CUSTOM_TYPE, { active: state.active, planFile: state.planFile });
	}

	function updateUI(ctx: ExtensionContext): void {
		if (state.active) {
			ctx.ui.setStatus("plan-mode", ctx.ui.theme.fg("warning", `⏸ plan: ${basename(state.planFile)}`));
		} else {
			ctx.ui.setStatus("plan-mode", undefined);
		}
	}

	async function enable(ctx: ExtensionContext, pathArg?: string): Promise<void> {
		state = { active: true, planFile: planFileFor(ctx.cwd, pathArg) };
		persist();
		updateUI(ctx);
		const exists = existsSync(state.planFile);
		ctx.ui.notify(
			`Plan mode ON — only ${state.planFile} can be modified.${exists ? " Existing plan found, it will be refined." : ""} /plan to exit.`,
			"info",
		);
	}

	async function disable(ctx: ExtensionContext): Promise<void> {
		const planExists = state.planFile !== "" && existsSync(state.planFile);
		let execute = false;
		if (planExists && ctx.hasUI) {
			const choice = await ctx.ui.select("Exit plan mode", [
				"Execute the plan",
				"Just exit plan mode",
			]);
			if (choice === undefined) return; // cancelled — stay in plan mode
			execute = choice === "Execute the plan";
		}
		const planFile = state.planFile;
		state = { active: false, planFile: "" };
		persist();
		updateUI(ctx);
		ctx.ui.notify("Plan mode OFF — full access restored.", "info");
		if (execute) {
			pi.sendUserMessage(
				`Plan mode is over. Read the plan at ${planFile} and execute it step by step. Verify each step as the plan specifies before moving to the next one.`,
			);
		}
	}

	async function toggle(ctx: ExtensionContext, args?: string): Promise<void> {
		const arg = args?.trim();
		if (state.active) {
			if (arg && arg !== "off") {
				ctx.ui.notify("Already in plan mode. Use /plan (or /plan off) to exit.", "warning");
				return;
			}
			await disable(ctx);
			return;
		}
		if (arg === "off") {
			ctx.ui.notify("Plan mode is not active.", "info");
			return;
		}
		await enable(ctx, arg === "on" ? undefined : arg);
	}

	// --- CLI flag ---

	pi.registerFlag("plan", {
		description: "Start in plan mode (read-only, PLAN.md output)",
		type: "boolean",
		default: false,
	});

	// --- Command & shortcut ---

	pi.registerCommand("plan", {
		description: "Toggle plan mode (read-only; only PLAN.md can be modified). /plan <path> to use a custom plan file",
		handler: async (args, ctx) => toggle(ctx, args),
	});

	pi.registerShortcut("ctrl+alt+p", {
		description: "Toggle plan mode",
		handler: async (ctx) => toggle(ctx),
	});

	// --- Enforcement ---

	pi.on("tool_call", async (event, ctx) => {
		if (!state.active) return;

		if (event.toolName === "write" || event.toolName === "edit") {
			const target = resolve(ctx.cwd, (event.input as { path: string }).path);
			if (target !== state.planFile) {
				return {
					block: true,
					reason: `Plan mode: file modifications are disabled. The only file you may write is the plan file: ${state.planFile}. Exit plan mode with /plan to modify other files.`,
				};
			}
			return;
		}

		if (event.toolName === "bash") {
			const result = checkBash((event.input as { command: string }).command);
			if (!result.safe) {
				return { block: true, reason: result.reason };
			}
		}
	});

	// --- System prompt injection ---

	pi.on("before_agent_start", async (event) => {
		if (!state.active) return;
		return {
			systemPrompt:
				event.systemPrompt +
				"\n\n" +
				buildPlanPrompt(state.planFile, existsSync(state.planFile)),
		};
	});

	// --- Restore state on session start/resume ---

	pi.on("session_start", async (_event, ctx) => {
		if (pi.getFlag("plan") === true && !state.active) {
			state = { active: true, planFile: planFileFor(ctx.cwd) };
		}

		// Branch-aware restore: replay the latest persisted state.
		for (const entry of ctx.sessionManager.getBranch()) {
			if (entry.type === "custom" && (entry as { customType?: string }).customType === CUSTOM_TYPE) {
				const data = (entry as { data?: PlanState }).data;
				if (data) state = { active: data.active ?? false, planFile: data.planFile ?? "" };
			}
		}

		// A plan file path recorded for a different cwd is stale — reset it.
		if (state.active && !state.planFile.startsWith(ctx.cwd)) {
			state = { active: false, planFile: "" };
		}

		updateUI(ctx);
	});
}
