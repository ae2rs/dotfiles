import {
	createBashToolDefinition,
	createEditToolDefinition,
	createFindToolDefinition,
	createGrepToolDefinition,
	createLsToolDefinition,
	createReadToolDefinition,
	createWriteToolDefinition,
	type ExtensionAPI,
	type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Box, type Component, Container, Text } from "@earendil-works/pi-tui";
import type { TSchema } from "typebox";

const CALL_COMPONENT = Symbol("collapsed-tool-call");
const RESULT_COMPONENT = Symbol("collapsed-tool-result");
const EXPANDED_BOX = Symbol("collapsed-tool-box");

type RenderState = Record<PropertyKey, Component | undefined>;
type DefinitionFactory<TParams extends TSchema, TDetails, TState> = (
	cwd: string,
) => ToolDefinition<TParams, TDetails, TState>;

/**
 * Keep a built-in tool fully hidden in Pi's collapsed view while preserving
 * its normal renderer and execution behavior in the expanded view.
 */
function registerCollapsedTool<TParams extends TSchema, TDetails, TState>(
	pi: ExtensionAPI,
	factory: DefinitionFactory<TParams, TDetails, TState>,
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

	pi.registerTool({
		...startupDefinition,
		renderShell: "self",

		execute(toolCallId, params, signal, onUpdate, ctx) {
			return getDefinition(ctx.cwd).execute(toolCallId, params, signal, onUpdate, ctx);
		},

		renderCall(args, theme, context) {
			const original = getDefinition(context.cwd).renderCall;
			const state = context.state as RenderState;
			const component = original
				? original(args, theme, { ...context, lastComponent: state[CALL_COMPONENT] })
				: new Text(theme.fg("toolTitle", theme.bold(startupDefinition.label)), 0, 0);
			state[CALL_COMPONENT] = component;

			if (!context.expanded) return new Container();

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
			const original = getDefinition(context.cwd).renderResult;
			const state = context.state as RenderState;
			const component = original
				? original(result, options, theme, { ...context, lastComponent: state[RESULT_COMPONENT] })
				: new Container();
			state[RESULT_COMPONENT] = component;

			if (!options.expanded) return new Container();

			const box = state[EXPANDED_BOX] as Box | undefined;
			box?.addChild(component);
			return new Container();
		},
	});
}

export default function (pi: ExtensionAPI): void {
	registerCollapsedTool(pi, createReadToolDefinition);
	registerCollapsedTool(pi, createBashToolDefinition);
	registerCollapsedTool(pi, createEditToolDefinition);
	registerCollapsedTool(pi, createWriteToolDefinition);
	registerCollapsedTool(pi, createGrepToolDefinition);
	registerCollapsedTool(pi, createFindToolDefinition);
	registerCollapsedTool(pi, createLsToolDefinition);

	pi.on("session_start", (event, ctx) => {
		if (event.reason !== "reload") ctx.ui.setToolsExpanded(false);
	});
}
