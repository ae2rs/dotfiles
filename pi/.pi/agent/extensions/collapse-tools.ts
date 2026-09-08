import {
	createBashToolDefinition,
	createEditToolDefinition,
	createFindToolDefinition,
	createGrepToolDefinition,
	createLsToolDefinition,
	createReadToolDefinition,
	createWriteToolDefinition,
	type ExtensionAPI,
	type ExtensionContext,
	type Theme,
	type ToolDefinition,
	type ToolRenderResultOptions,
} from "@earendil-works/pi-coding-agent";
import { Box, type Component, Container, Text } from "@earendil-works/pi-tui";
import type { TSchema } from "typebox";
import {
	commandPreview,
	diffStats,
	formatStats,
	formatSummary,
	relativePath,
	writeStats,
	type DiffStats,
} from "./collapse-tools/format.ts";

const CALL_COMPONENT = Symbol("collapsed-tool-call");
const RESULT_COMPONENT = Symbol("collapsed-tool-result");
const EXPANDED_BOX = Symbol("collapsed-tool-box");

type RenderState = Record<PropertyKey, Component | undefined>;
type DefinitionFactory<TParams extends TSchema, TDetails, TState> = (
	cwd: string,
) => ToolDefinition<TParams, TDetails, TState>;

type CollapseStrategy = "aggregate" | "bash" | "edit";

/** Subset of ToolRenderContext the collapsed renderers rely on. */
interface CollapsedRenderContext {
	args: unknown;
	toolCallId: string;
	cwd: string;
	state: any;
	isPartial: boolean;
	isError: boolean;
	invalidate: () => void;
}

type ToolResult = { content: Array<{ type: string; text?: string }>; details?: unknown };

// --- Aggregate grouping -----------------------------------------------------
// Consecutive aggregate tool calls (per assistant message) collapse into one
// summary line rendered by the first call of the group (the "anchor"); later
// calls render nothing and update the anchor in place.

interface GroupState {
	counts: Map<string, number>;
	counted: Set<string>;
	anchor?: { id: string; text: Text; invalidate: () => void };
}

const groups = new Map<string, GroupState>();
const groupKeyByToolCall = new Map<string, string>();
let liveGroupCounter = 0;
let liveGroupKey = "live-0";

function resetGroups(): void {
	groups.clear();
	groupKeyByToolCall.clear();
	liveGroupKey = `live-${++liveGroupCounter}`;
}

function resolveGroup(toolCallId: string): GroupState {
	let key = groupKeyByToolCall.get(toolCallId);
	if (!key) {
		key = liveGroupKey;
		groupKeyByToolCall.set(toolCallId, key);
	}
	let group = groups.get(key);
	if (!group) {
		group = { counts: new Map(), counted: new Set() };
		groups.set(key, group);
	}
	return group;
}

/**
 * Rebuild grouping for an already-restored chat: one group per assistant
 * message, keyed by its tool call ids. Chat is restored before session_start
 * handlers run, so restored rows initially render without grouping; the
 * session_start handler forces a re-render after this map is in place.
 */
function restoreGroups(ctx: ExtensionContext): void {
	let index = 0;
	for (const entry of ctx.sessionManager.getBranch()) {
		if (entry.type !== "message" || entry.message.role !== "assistant") continue;
		const key = `restored-${index++}`;
		for (const content of entry.message.content) {
			if (content.type === "toolCall") {
				groupKeyByToolCall.set(content.id, key);
			}
		}
	}
}

function renderAggregateCall(
	label: string,
	theme: Theme,
	context: CollapsedRenderContext,
): Component {
	const group = resolveGroup(context.toolCallId);
	if (!group.counted.has(context.toolCallId)) {
		group.counted.add(context.toolCallId);
		group.counts.set(label, (group.counts.get(label) ?? 0) + 1);
	}
	const content =
		theme.fg("toolTitle", theme.bold("⚒ ")) + theme.fg("muted", formatSummary(group.counts));
	const anchor = group.anchor;
	if (anchor) {
		anchor.text.setText(content);
		if (anchor.id !== context.toolCallId) {
			anchor.invalidate();
			return new Container();
		}
		return anchor.text;
	}
	const text = new Text(content, 1, 0);
	group.anchor = { id: context.toolCallId, text, invalidate: context.invalidate };
	return text;
}

// --- Edit/write lines --------------------------------------------------------
// One line per file mutation: "✎ edit path/to/file (+a −b)". The stats arrive
// with the result, so the result renderer mutates the call line in place via
// row-local state instead of adding a second line.

const EDIT_LINE = Symbol("edit-line-component");
const EDIT_PATH = Symbol("edit-line-path");
const EDIT_STATS = Symbol("edit-line-stats");

function editLineContent(
	theme: Theme,
	label: string,
	relPath: string,
	stats: DiffStats | undefined,
): string {
	let content = theme.fg("toolTitle", theme.bold(`✎ ${label} `)) + theme.fg("accent", relPath);
	const statText = formatStats(stats);
	if (statText) content += ` ${theme.fg("muted", statText)}`;
	return content;
}

function renderEditCall(
	label: string,
	args: unknown,
	theme: Theme,
	context: CollapsedRenderContext,
): Component {
	const state = context.state;
	const path = (args as { path?: unknown } | undefined)?.path;
	const relPath = relativePath(context.cwd, typeof path === "string" ? path : "");
	state[EDIT_PATH] = relPath;
	const text = (state[EDIT_LINE] as Text | undefined) ?? new Text("", 1, 0);
	text.setText(editLineContent(theme, label, relPath, state[EDIT_STATS] as DiffStats | undefined));
	state[EDIT_LINE] = text;
	return text;
}

function renderEditResult(
	label: string,
	result: ToolResult,
	options: ToolRenderResultOptions,
	theme: Theme,
	context: CollapsedRenderContext,
): Component {
	if (options.isPartial) return new Container();
	const state = context.state;
	const text = state[EDIT_LINE] as Text | undefined;
	const relPath = (state[EDIT_PATH] as string | undefined) ?? "";
	if (context.isError) {
		text?.setText(theme.fg("error", `✗ ${label} `) + theme.fg("muted", relPath));
		return new Container();
	}
	const stats =
		label === "write"
			? writeStats(String((context.args as { content?: unknown } | undefined)?.content ?? ""))
			: diffStats(String((result.details as { diff?: unknown } | undefined)?.diff ?? ""));
	state[EDIT_STATS] = stats;
	text?.setText(editLineContent(theme, label, relPath, stats));
	return new Container();
}

function collapsedCall(
	strategy: CollapseStrategy,
	label: string,
	args: unknown,
	theme: Theme,
	context: CollapsedRenderContext,
): Component {
	if (strategy === "aggregate") return renderAggregateCall(label, theme, context);
	if (strategy === "bash") {
		const command = (args as { command?: unknown } | undefined)?.command;
		const preview = commandPreview(typeof command === "string" ? command : "");
		return new Text(theme.fg("toolTitle", theme.bold("$ ")) + theme.fg("muted", preview), 1, 0);
	}
	return renderEditCall(label, args, theme, context);
}

function collapsedResult(
	strategy: CollapseStrategy,
	label: string,
	result: ToolResult,
	options: ToolRenderResultOptions,
	theme: Theme,
	context: CollapsedRenderContext,
): Component {
	if (strategy === "bash") {
		if (options.isPartial || !context.isError) return new Container();
		return new Text(theme.fg("error", "✗ command failed"), 1, 0);
	}
	if (strategy === "edit") return renderEditResult(label, result, options, theme, context);
	return new Container();
}

/**
 * Keep a built-in tool compact in Pi's collapsed view while preserving its
 * normal renderer and execution behavior in the expanded view.
 */
function registerCollapsedTool<TParams extends TSchema, TDetails, TState>(
	pi: ExtensionAPI,
	factory: DefinitionFactory<TParams, TDetails, TState>,
	strategy: CollapseStrategy,
): void {
	const definitions = new Map<string, ToolDefinition<TParams, TDetails, TState>>();

	function getDefinition(cwd: string): ToolDefinition<TParams, TDetails, TState> {
		let definition = definitions.get(cwd);
		if (!definition) {
			definition = factory(cwd);
			definitions.set(cwd, definition);
		}
		return definition;
	}

	const startupDefinition = getDefinition(process.cwd());
	const label = startupDefinition.label;

	pi.registerTool({
		...startupDefinition,

		execute(toolCallId, params, signal, onUpdate, ctx) {
			return getDefinition(ctx.cwd).execute(toolCallId, params, signal, onUpdate, ctx);
		},

		renderShell: "self",

		renderCall(args, theme, context) {
			if (!context.expanded) {
				return collapsedCall(strategy, label, args, theme, context);
			}

			const original = getDefinition(context.cwd).renderCall;
			const state = context.state as RenderState;
			const component = original
				? original(args, theme, { ...context, lastComponent: state[CALL_COMPONENT] })
				: new Text(theme.fg("toolTitle", theme.bold(label)), 0, 0);
			state[CALL_COMPONENT] = component;

			const background = context.isPartial
				? "toolPendingBg"
				: context.isError
					? "toolErrorBg"
					: "toolSuccessBg";
			const box = (state[EXPANDED_BOX] as Box | undefined) ?? new Box(1, 1);
			box.setBgFn((text) => theme.bg(background, text));
			box.clear();
			box.addChild(component);
			state[EXPANDED_BOX] = box;
			return box;
		},

		renderResult(result, options, theme, context) {
			if (!options.expanded) {
				return collapsedResult(strategy, label, result, options, theme, context);
			}

			const original = getDefinition(context.cwd).renderResult;
			const state = context.state as RenderState;
			const component = original
				? original(result, options, theme, { ...context, lastComponent: state[RESULT_COMPONENT] })
				: new Container();
			state[RESULT_COMPONENT] = component;

			const box = state[EXPANDED_BOX] as Box | undefined;
			box?.addChild(component);
			return new Container();
		},
	});
}

export default function (pi: ExtensionAPI): void {
	registerCollapsedTool(pi, createReadToolDefinition, "aggregate");
	registerCollapsedTool(pi, createBashToolDefinition, "bash");
	registerCollapsedTool(pi, createEditToolDefinition, "edit");
	registerCollapsedTool(pi, createWriteToolDefinition, "edit");
	registerCollapsedTool(pi, createGrepToolDefinition, "aggregate");
	registerCollapsedTool(pi, createFindToolDefinition, "aggregate");
	registerCollapsedTool(pi, createLsToolDefinition, "aggregate");

	pi.on("message_start", (event) => {
		if (event.message.role === "assistant") {
			liveGroupKey = `live-${++liveGroupCounter}`;
		}
	});

	pi.on("session_start", (event, ctx) => {
		resetGroups();
		restoreGroups(ctx);
		const expanded = event.reason === "reload" ? ctx.ui.getToolsExpanded() : false;
		// Chat is restored before this handler runs, so restored rows rendered
		// without grouping; force a re-render now that the group map is rebuilt.
		if (groupKeyByToolCall.size > 0) ctx.ui.setToolsExpanded(!expanded);
		ctx.ui.setToolsExpanded(expanded);
	});
}
