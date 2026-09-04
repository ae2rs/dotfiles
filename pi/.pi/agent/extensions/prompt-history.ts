/**
 * Cross-session reverse search for user prompts.
 *
 * Ctrl+R (or /history) searches every persisted Pi session and inserts the
 * selected prompt into the editor. Rows show the line that matched, with the
 * matched text highlighted, so the ranking in `prompt-history/search.ts` is
 * legible rather than something the reader has to take on faith.
 */

import { basename, dirname } from "node:path";
import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { Input, Key, matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import { PromptHistoryCache } from "./prompt-history/data.ts";
import { type PromptMatch, searchPrompts } from "./prompt-history/search.ts";

const MAX_VISIBLE_PROMPTS = 12;
const ELLIPSIS = "…";

type Ranges = Array<[number, number]>;

/** Move ranges by `shift`, dropping what the window cut and what `limit` excludes. */
function clampRanges(ranges: Ranges, shift: number, limit: number): Ranges {
	const clamped: Ranges = [];
	for (const [start, end] of ranges) {
		const from = start + shift;
		if (from >= limit) break;
		if (from >= 0) clamped.push([from, Math.min(end + shift, limit)]);
	}
	return clamped;
}

/**
 * Clamp `line` to `width`, scrolling it so a match past the right edge stays
 * visible. Truncation happens before styling because colour codes would
 * otherwise be counted as columns and cut mid-escape. The returned ranges are
 * guaranteed to fall inside the returned text and off either ellipsis.
 */
function windowLine(line: string, ranges: Ranges, width: number): { text: string; ranges: Ranges } {
	const firstMatch = ranges[0]?.[0] ?? 0;
	const scrolled = firstMatch >= width;
	const offset = scrolled ? firstMatch - Math.floor(width / 4) : 0;
	const windowed = scrolled ? ELLIPSIS + line.slice(offset) : line;
	const text = truncateToWidth(windowed, width, ELLIPSIS);
	const truncated = text.length < windowed.length;
	return {
		text,
		ranges: clampRanges(
			ranges,
			scrolled ? ELLIPSIS.length - offset : 0,
			text.length - (truncated ? ELLIPSIS.length : 0),
		),
	};
}

function styleRanges(
	text: string,
	ranges: Ranges,
	match: (s: string) => string,
	rest: (s: string) => string,
): string {
	let styled = "";
	let cursor = 0;
	for (const [start, end] of ranges) {
		styled += rest(text.slice(cursor, start)) + match(text.slice(start, end));
		cursor = end;
	}
	return styled + rest(text.slice(cursor));
}

function renderRow(entry: PromptMatch, width: number, theme: Theme, selected: boolean): string {
	const suffix = entry.prompt.count > 1 ? ` ×${entry.prompt.count}` : "";
	const { text, ranges } = windowLine(entry.line, entry.ranges, Math.max(1, width - suffix.length));
	const rest = selected ? (s: string) => theme.fg("accent", s) : (s: string) => s;
	const match = (s: string) => theme.bg("searchMatchBg", theme.fg("searchMatchText", s));
	return styleRanges(text, ranges, match, rest) + theme.fg("dim", suffix);
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

async function openHistory(ctx: ExtensionContext, cache: PromptHistoryCache): Promise<void> {
	if (ctx.mode !== "tui") {
		ctx.ui.notify("Prompt history is available in the interactive TUI only.", "warning");
		return;
	}

	const sessionsRoot = dirname(ctx.sessionManager.getSessionDir());
	const prompts = await cache.load(sessionsRoot);
	if (prompts.length === 0) {
		ctx.ui.notify("No saved user prompts found.", "info");
		return;
	}

	const editorText = ctx.ui.getEditorText();
	const initialQuery = editorText.includes("\n") ? "" : editorText;
	return ctx.ui.custom<void>(
		(tui, theme, _keybindings, done) => {
			const input = new Input({ prompt: "Search: ", placeholder: "type to filter saved prompts" });
			input.focused = true;
			input.setValue(initialQuery);
			let matches = searchPrompts(prompts, initialQuery);
			let selectedIndex = 0;
			let query = initialQuery;

			const refreshMatches = () => {
				const nextQuery = input.getValue();
				if (nextQuery === query) return;
				query = nextQuery;
				matches = searchPrompts(prompts, query);
				selectedIndex = 0;
				tui.requestRender();
			};
			/**
			 * Neither `setEditorText` nor `pasteToEditor` requests a repaint, and the
			 * editor's own `onChange` does not either, so an insertion made after this
			 * overlay closed would sit invisible until the next keystroke. Insert while
			 * a `tui` to render with is still in scope, as Pi's own programmatic paste
			 * does. Paste handling also collapses anything over 10 lines or 1000
			 * characters to a `[paste #N]` marker; it inserts at the cursor, so drop
			 * whatever text seeded the search first.
			 */
			const insertAndClose = (entry?: PromptMatch) => {
				if (entry) {
					ctx.ui.setEditorText("");
					ctx.ui.pasteToEditor(entry.prompt.text);
					tui.requestRender();
				}
				done();
			};
			input.onSubmit = () => insertAndClose(matches[selectedIndex]);

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
						for (
							let index = start;
							index < Math.min(matches.length, start + MAX_VISIBLE_PROMPTS);
							index += 1
						) {
							const entry = matches[index];
							const selected = index === selectedIndex;
							const prefix = selected ? theme.fg("accent", "> ") : "  ";
							lines.push(prefix + renderRow(entry, contentWidth - 2, theme, selected));
							const { cwd, sessionFile, timestamp } = entry.prompt;
							const project = cwd ? basename(cwd) : basename(dirname(sessionFile));
							lines.push(theme.fg("dim", `    ${project} · ${age(timestamp)}`));
						}
					}
					lines.push("", theme.fg("dim", " ↑↓ navigate · Enter insert · Esc cancel"));
					return lines;
				},
				invalidate() {},
				handleInput(data: string) {
					if (matchesKey(data, Key.escape)) {
						done();
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
						selectedIndex = Math.min(
							Math.max(0, matches.length - 1),
							selectedIndex + MAX_VISIBLE_PROMPTS,
						);
						tui.requestRender();
						return;
					}
					input.handleInput(data);
					refreshMatches();
				},
			};
		},
		{ overlay: true, overlayOptions: { width: "80%", margin: 2 } },
	);
}

export default function promptHistory(pi: ExtensionAPI): void {
	const cache = new PromptHistoryCache();

	pi.registerCommand("history", {
		description: "Search user prompts across all saved sessions",
		handler: async (_args, ctx) => openHistory(ctx, cache),
	});
	pi.registerShortcut("ctrl+r", {
		description: "Search saved user prompts",
		handler: async (ctx) => openHistory(ctx, cache),
	});
}
