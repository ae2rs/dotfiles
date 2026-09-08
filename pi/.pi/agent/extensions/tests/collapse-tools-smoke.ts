/**
 * Smoke harness: loads collapse-tools.ts with a mock ExtensionAPI and exercises
 * the registered tool renderers the way tool-execution.ts would. Run with:
 *   bun run tests/collapse-tools-smoke.ts
 */
import type { Component } from "@earendil-works/pi-tui";
import { initTheme } from "@earendil-works/pi-coding-agent";
import extension from "../collapse-tools.ts";

// Built-in renderers resolve a global theme proxy; install a real one.
initTheme("tokyo-night", false);

const mockTheme = {
	fg: (_color: string, text: string) => text,
	bg: (_color: string, text: string) => text,
	bold: (text: string) => text,
} as never;

const tools = new Map<string, Record<string, unknown>>();
const handlers = new Map<string, Array<(event: unknown, ctx: unknown) => unknown>>();

const pi = {
	registerTool(tool: Record<string, unknown> & { name: string }) {
		tools.set(tool.name, tool);
	},
	on(event: string, handler: (event: unknown, ctx: unknown) => unknown) {
		const list = handlers.get(event) ?? [];
		list.push(handler);
		handlers.set(event, list);
	},
};

extension(pi as never);

export function fire(event: string, payload: unknown, ctx: unknown = {}): void {
	for (const handler of handlers.get(event) ?? []) handler(payload, ctx);
}

export function makeContext(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		args: {},
		toolCallId: `call-${Math.random().toString(36).slice(2)}`,
		invalidate: () => {},
		lastComponent: undefined,
		state: {},
		cwd: process.cwd(),
		executionStarted: true,
		argsComplete: true,
		isPartial: false,
		expanded: false,
		isError: false,
		showImages: false,
		...overrides,
	};
}

export function renderCall(
	toolName: string,
	args: unknown,
	context: Record<string, unknown>,
): Component {
	const tool = tools.get(toolName);
	if (!tool) throw new Error(`tool not registered: ${toolName}`);
	return (tool.renderCall as (...a: unknown[]) => Component)(args, mockTheme, context);
}

export function renderResult(
	toolName: string,
	result: unknown,
	options: { expanded: boolean; isPartial: boolean },
	context: Record<string, unknown>,
): Component {
	const tool = tools.get(toolName);
	if (!tool) throw new Error(`tool not registered: ${toolName}`);
	return (tool.renderResult as (...a: unknown[]) => Component)(result, options, mockTheme, context);
}

export function registeredTools(): string[] {
	return [...tools.keys()];
}

export function componentText(component: Component): string {
	return (component as { render?: (width: number) => string[] }).render?.(120)?.join("\n") ?? "";
}

if (import.meta.main) {
	console.log("registered:", registeredTools().join(", "));
	const context = makeContext();
	const component = renderCall("read", { path: "/tmp/x" }, context);
	console.log("collapsed read render:", JSON.stringify(componentText(component)));
	console.log("smoke ok");
}
