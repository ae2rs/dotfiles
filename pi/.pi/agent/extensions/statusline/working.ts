import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { WORKING_FRAMES } from "./icons.ts";

type Tone = "green" | "yellow" | "red";
type Activity = "thinking" | "command" | "tool";
type ActiveTool = { name: string; detail: string };

const TONE_COLORS = { green: "success", yellow: "warning", red: "error" } as const;
const COMMAND_TOOLS = new Set(["bash", "powershell"]);
const TICK_MS = 250;

function formatElapsed(ms: number): string {
	if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
	const minutes = Math.floor(ms / 60_000);
	const seconds = Math.floor((ms % 60_000) / 1000);
	return `${minutes}m ${seconds}s`;
}

function pluralize(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function summarizeTool(toolName: string, args: unknown): string {
	const input = args && typeof args === "object" ? args as Record<string, unknown> : {};
	const detail =
		typeof input.command === "string"
			? input.command
			: typeof input.path === "string"
				? `${toolName} ${input.path}`
				: typeof input.pattern === "string"
					? `${toolName} ${input.pattern}`
					: typeof input.query === "string"
						? `${toolName} ${input.query}`
						: toolName;
	const oneLine = detail.replace(/\s+/g, " ").trim();
	return oneLine.length > 80 ? `${oneLine.slice(0, 79)}…` : oneLine;
}

function currentActivity(activeTools: Map<string, ActiveTool>): Activity {
	const tools = [...activeTools.values()];
	const currentTool = tools[tools.length - 1];
	if (!currentTool) return "thinking";
	return COMMAND_TOOLS.has(currentTool.name) ? "command" : "tool";
}

export function setupWorkingIndicator(pi: ExtensionAPI): void {
	let timer: ReturnType<typeof setInterval> | undefined;
	let lastTokenAt = 0;
	let agentStartAt = 0;
	let tone: Tone | undefined;
	let activity: Activity | undefined;
	const activeTools = new Map<string, ActiveTool>();
	let commandsStarted = 0;
	let toolsStarted = 0;

	function applyIndicator(ctx: ExtensionContext, nextTone: Tone, nextActivity: Activity): void {
		tone = nextTone;
		activity = nextActivity;
		try {
			const color =
				nextActivity === "command" ? "bashMode" : nextActivity === "tool" ? "accent" : TONE_COLORS[nextTone];
			ctx.ui.setWorkingIndicator({
				frames: WORKING_FRAMES.map((frame) => ctx.ui.theme.fg(color, frame)),
				intervalMs: 100,
			});
		} catch {
			// Stale ctx after session replacement or reload.
		}
	}

	function tick(ctx: ExtensionContext): void {
		const now = Date.now();
		const nextActivity = currentActivity(activeTools);
		const nextTone: Tone =
			now - lastTokenAt < 10_000 ? "green" : now - lastTokenAt < 30_000 ? "yellow" : "red";
		if (nextTone !== tone || nextActivity !== activity) applyIndicator(ctx, nextTone, nextActivity);
		if (!agentStartAt) return;

		const tools = [...activeTools.values()];
		const currentTool = tools[tools.length - 1];
		const message =
			nextActivity === "thinking"
				? "Thinking…"
				: nextActivity === "command"
					? `Running ${pluralize(commandsStarted, "command")}…`
					: `Using ${pluralize(toolsStarted, "tool")}…`;
		const detail = currentTool?.detail ?? formatElapsed(now - agentStartAt);
		try {
			ctx.ui.setWorkingMessage(`${message}  ${ctx.ui.theme.fg("dim", detail)}`);
		} catch {
			// Stale ctx after session replacement or reload.
		}
	}

	function reset(): void {
		activeTools.clear();
		commandsStarted = 0;
		toolsStarted = 0;
	}

	function stopTimer(): void {
		if (timer) clearInterval(timer);
		timer = undefined;
	}

	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode !== "tui") return;
		stopTimer();
		tone = undefined;
		activity = undefined;
		agentStartAt = 0;
		reset();
		setTimeout(() => {
			if (ctx.mode === "tui") applyIndicator(ctx, "green", "thinking");
		}, 0);
	});

	pi.on("agent_start", (_event, ctx) => {
		if (ctx.mode !== "tui") return;
		stopTimer();
		reset();
		agentStartAt = Date.now();
		lastTokenAt = agentStartAt;
		applyIndicator(ctx, "green", "thinking");
		tick(ctx);
		timer = setInterval(() => tick(ctx), TICK_MS);
	});

	pi.on("message_update", () => {
		lastTokenAt = Date.now();
	});

	pi.on("tool_execution_start", (event, ctx) => {
		if (ctx.mode !== "tui") return;
		activeTools.set(event.toolCallId, {
			name: event.toolName,
			detail: summarizeTool(event.toolName, event.args),
		});
		if (COMMAND_TOOLS.has(event.toolName)) commandsStarted += 1;
		else toolsStarted += 1;
		tick(ctx);
	});

	pi.on("tool_execution_end", (event, ctx) => {
		if (ctx.mode !== "tui") return;
		activeTools.delete(event.toolCallId);
		lastTokenAt = Date.now();
		tick(ctx);
	});

	pi.on("agent_end", (_event, ctx) => {
		stopTimer();
		agentStartAt = 0;
		reset();
		setTimeout(() => {
			try {
				ctx.ui.setWorkingMessage();
			} catch {
				// Stale ctx after session replacement or reload.
			}
		}, 2000);
	});

	pi.on("session_shutdown", () => stopTimer());
}
