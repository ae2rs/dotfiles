/**
 * Cross-session reverse search for user prompts.
 *
 * Ctrl+R (or /prompts) searches every persisted Pi session and inserts the
 * selected prompt into the editor. The picker uses pi-tui's fuzzyFilter so its
 * matching behavior stays consistent with Pi's own UI.
 */

import { basename, dirname } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { fuzzyFilter, Input, Key, matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import { PromptHistoryCache, type Prompt } from "./prompt-history/data.ts";

const MAX_VISIBLE_PROMPTS = 12;

function filterPrompts(prompts: Prompt[], query: string): Prompt[] {
	return fuzzyFilter(prompts, query, (prompt) => prompt.text);
}

function displayPrompt(prompt: Prompt, width: number): string {
	const firstLine = prompt.text.split("\n", 1)[0] ?? "";
	const suffix = prompt.count > 1 ? ` ×${prompt.count}` : "";
	return truncateToWidth(firstLine, Math.max(1, width - suffix.length)) + suffix;
}

function age(timestamp: number): string {
	const elapsed = Math.max(0, Date.now() - timestamp);
	const units: Array<[string, number]> = [
		["d", 86_400_000],
		["h", 3_600_000],
		["m", 60_000],
	];
	for (const [label, milliseconds] of units) {
		if (elapsed >= milliseconds) return `${Math.floor(elapsed / milliseconds)}${label} ago`;
	}
	return "now";
}

async function pickPrompt(ctx: ExtensionContext, cache: PromptHistoryCache): Promise<Prompt | undefined> {
	if (ctx.mode !== "tui") {
		ctx.ui.notify("Prompt history is available in the interactive TUI only.", "warning");
		return undefined;
	}

	const sessionsRoot = dirname(ctx.sessionManager.getSessionDir());
	const prompts = await cache.load(sessionsRoot);
	if (prompts.length === 0) {
		ctx.ui.notify("No saved user prompts found.", "info");
		return undefined;
	}

	const editorText = ctx.ui.getEditorText();
	const initialQuery = editorText.includes("\n") ? "" : editorText;
	return ctx.ui.custom<Prompt | undefined>((tui, theme, _keybindings, done) => {
		const input = new Input({ prompt: "Search: ", placeholder: "type to filter saved prompts" });
		input.focused = true;
		input.setValue(initialQuery);
		let matches = filterPrompts(prompts, initialQuery);
		let selectedIndex = 0;
		let query = initialQuery;

		const refreshMatches = () => {
			const nextQuery = input.getValue();
			if (nextQuery !== query) selectedIndex = 0;
			query = nextQuery;
			matches = filterPrompts(prompts, query);
			selectedIndex = Math.min(selectedIndex, Math.max(0, matches.length - 1));
			tui.requestRender();
		};
		input.onSubmit = () => done(matches[selectedIndex]);

		return {
			render(width: number): string[] {
			const contentWidth = Math.max(1, width - 2);
			const lines = [
				theme.fg("accent", theme.bold(" Prompt history")),
				...input.render(contentWidth).map((line) => ` ${line}`),
				"",
			];
			if (matches.length === 0) {
				lines.push(theme.fg("warning", " No matching prompts"));
			} else {
				const start = Math.min(
					Math.max(0, selectedIndex - Math.floor(MAX_VISIBLE_PROMPTS / 2)),
					Math.max(0, matches.length - MAX_VISIBLE_PROMPTS),
				);
				for (let index = start; index < Math.min(matches.length, start + MAX_VISIBLE_PROMPTS); index += 1) {
					const prompt = matches[index];
					const selected = index === selectedIndex;
					const prefix = selected ? theme.fg("accent", "> ") : "  ";
					const label = displayPrompt(prompt, contentWidth - 2);
					lines.push(`${prefix}${selected ? theme.fg("accent", label) : label}`);
					const project = prompt.cwd ? basename(prompt.cwd) : basename(dirname(prompt.sessionFile));
					lines.push(theme.fg("dim", `    ${project} · ${age(prompt.timestamp)}`));
				}
			}
			lines.push("", theme.fg("dim", " ↑↓ navigate · Enter insert · Esc cancel"));
			return lines;
		},
			invalidate() {},
			handleInput(data: string) {
				if (matchesKey(data, Key.escape)) {
					done(undefined);
					return;
				}
				if (matchesKey(data, Key.up)) {
					selectedIndex = Math.max(0, selectedIndex - 1);
					tui.requestRender();
					return;
				}
				if (matchesKey(data, Key.down)) {
					selectedIndex = Math.min(Math.max(0, matches.length - 1), selectedIndex + 1);
					tui.requestRender();
					return;
				}
				if (matchesKey(data, Key.pageUp)) {
					selectedIndex = Math.max(0, selectedIndex - MAX_VISIBLE_PROMPTS);
					tui.requestRender();
					return;
				}
				if (matchesKey(data, Key.pageDown)) {
					selectedIndex = Math.min(Math.max(0, matches.length - 1), selectedIndex + MAX_VISIBLE_PROMPTS);
					tui.requestRender();
					return;
				}
				input.handleInput(data);
				refreshMatches();
			},
		};
	}, { overlay: true, overlayOptions: { width: "80%", margin: 2 } });
}

export default function promptHistory(pi: ExtensionAPI): void {
	const cache = new PromptHistoryCache();

	async function open(ctx: ExtensionContext): Promise<void> {
		const prompt = await pickPrompt(ctx, cache);
		if (prompt) ctx.ui.setEditorText(prompt.text);
	}

	pi.registerCommand("prompts", {
		description: "Search user prompts across all saved sessions",
		handler: async (_args, ctx) => open(ctx),
	});
	pi.registerShortcut("ctrl+r", {
		description: "Search saved user prompts",
		handler: async (ctx) => open(ctx),
	});
}
