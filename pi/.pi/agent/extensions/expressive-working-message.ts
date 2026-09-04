import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

type Activity = "thinking" | "command" | "tool";

const COMMAND_TOOLS = new Set(["bash", "powershell"]);

function pluralize(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function updateWorkingMessage(
	activeTools: Map<string, string>,
	commandsStarted: number,
	toolsStarted: number,
	ctx: ExtensionContext,
): void {
	const activeToolNames = [...activeTools.values()];
	const hasCommand = activeToolNames.some((name) => COMMAND_TOOLS.has(name));
	const hasTool = activeToolNames.some((name) => !COMMAND_TOOLS.has(name));
	const activity: Activity = hasCommand ? "command" : hasTool ? "tool" : "thinking";

	ctx.ui.setWorkingIndicator({
		frames: [
			ctx.ui.theme.fg(
				activity === "thinking" ? "muted" : "accent",
				activity === "thinking" ? "◌" : activity === "command" ? "▸" : "◆",
			),
		],
	});

	if (activity === "thinking") {
		ctx.ui.setWorkingMessage("Thinking…");
	} else if (activity === "command" && !hasTool) {
		ctx.ui.setWorkingMessage(`Running ${pluralize(commandsStarted, "command")}…`);
	} else if (activity === "tool" && !hasCommand) {
		ctx.ui.setWorkingMessage(`Using ${pluralize(toolsStarted, "tool")}…`);
	} else {
		ctx.ui.setWorkingMessage(
			`Running ${pluralize(commandsStarted, "command")} · using ${pluralize(toolsStarted, "tool")}…`,
		);
	}
}

export default function (pi: ExtensionAPI): void {
	const activeTools = new Map<string, string>();
	let commandsStarted = 0;
	let toolsStarted = 0;

	function reset(ctx: ExtensionContext): void {
		activeTools.clear();
		commandsStarted = 0;
		toolsStarted = 0;
		updateWorkingMessage(activeTools, commandsStarted, toolsStarted, ctx);
	}

	pi.on("session_start", (_event, ctx) => reset(ctx));
	pi.on("agent_start", (_event, ctx) => reset(ctx));

	pi.on("tool_execution_start", (event, ctx) => {
		activeTools.set(event.toolCallId, event.toolName);
		if (COMMAND_TOOLS.has(event.toolName)) commandsStarted += 1;
		else toolsStarted += 1;
		updateWorkingMessage(activeTools, commandsStarted, toolsStarted, ctx);
	});

	pi.on("tool_execution_end", (event, ctx) => {
		activeTools.delete(event.toolCallId);
		updateWorkingMessage(activeTools, commandsStarted, toolsStarted, ctx);
	});

	pi.on("agent_settled", (_event, ctx) => reset(ctx));
}
