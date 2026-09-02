/**
 * statusline — self-owned Pi UI: two-line footer, boxed editor, adaptive
 * working indicator, and per-message usage stats.
 *
 * - footer.ts   two-line footer: model + thinking level, subscription-usage
 *               bar (Claude/Kimi/Codex) and context bar, PLAN/AUTO badge,
 *               git branch, cwd, other extension statuses. No API cost.
 * - usage.ts    unified subscription-usage service (folds in the old
 *               claude-usage.ts / kimi-usage.ts extensions).
 * - working.ts  MDI clock working indicator colored by token latency.
 * - stats.ts    per-assistant-message token/duration one-liner.
 * - editor.ts   rounded-box input editor.
 * - bars.ts     ▓/░ bar renderer; icons.ts   all glyphs in one place.
 *
 * Pair with the `tokyo-night` theme (pi/.pi/agent/themes/tokyo-night.json).
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { BoxedEditor } from "./editor.ts";
import { installFooter, type FooterHandle } from "./footer.ts";
import { setupStats } from "./stats.ts";
import { createUsageService } from "./usage.ts";
import { setupWorkingIndicator } from "./working.ts";

export default function statuslineExtension(pi: ExtensionAPI) {
	const usage = createUsageService(pi);
	let footer: FooterHandle | undefined;

	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode !== "tui" || !ctx.hasUI) return;
		ctx.ui.setEditorComponent((tui, theme, keybindings) => new BoxedEditor(tui, theme, keybindings));
		footer?.dispose();
		footer = installFooter(ctx, pi, usage);
	});

	pi.on("session_shutdown", () => {
		footer?.dispose();
		footer = undefined;
	});

	setupWorkingIndicator(pi);
	setupStats(pi);
}
