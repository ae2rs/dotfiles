/**
 * footer — custom two-line statusline footer.
 *
 * Line 1: model + thinking level (left), subscription-usage bar for the
 *         active provider + context-window bar (right). No API cost anywhere
 *         — subscription headroom only.
 * Line 2: PLAN/AUTO mode badge, git branch, shortened cwd (left), other
 *         extensions' statuses (right).
 *
 * Plan-mode state is detected independently of the plan extension by
 * replaying the latest `plan-mode` custom entry on the session branch (the
 * same logic plan.ts uses for session restore), falling back to the
 * presence of its "plan-mode" status key (covers --plan-flag activation
 * before the first persisted entry).
 *
 * Re-renders on: git branch change, usage updates, a 60 s countdown tick,
 * and model/thinking/agent lifecycle events.
 */
import { homedir } from "node:os";
import type {
	CustomEntry,
	ExtensionAPI,
	ExtensionContext,
	ReadonlyFooterDataProvider,
	Theme,
	ThemeColor,
} from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth, type TUI } from "@earendil-works/pi-tui";
import { barColor, formatPct, renderBar } from "./bars.ts";
import { ICONS } from "./icons.ts";
import { formatResetsAt, usageProviderOf, type UsageService } from "./usage.ts";

export interface FooterHandle {
	requestRender(): void;
	dispose(): void;
}

/** Status keys superseded by native footer elements; hidden from line 2. */
const FILTERED_STATUS_KEYS = new Set(["plan-mode", "claude-usage", "kimi-usage"]);

const TICK_INTERVAL_MS = 60 * 1000;

const THINKING_COLORS: Record<string, ThemeColor> = {
	off: "thinkingOff",
	minimal: "thinkingMinimal",
	low: "thinkingLow",
	medium: "thinkingMedium",
	high: "thinkingHigh",
	xhigh: "thinkingXhigh",
	max: "thinkingMax",
};

function shortenCwd(cwd: string): string {
	const home = homedir();
	if (home && (cwd === home || cwd.startsWith(`${home}/`))) {
		return `~${cwd.slice(home.length)}`;
	}
	return cwd;
}

function sanitizeStatus(text: string): string {
	return text.replace(/[\r\n\t]+/g, " ").trim();
}

function detectPlanMode(ctx: ExtensionContext, footerData: ReadonlyFooterDataProvider): boolean {
	let found = false;
	let active = false;
	for (const entry of ctx.sessionManager.getBranch()) {
		if (entry.type === "custom" && (entry as CustomEntry).customType === "plan-mode") {
			const data = (entry as CustomEntry<{ active?: boolean }>).data;
			if (data) {
				found = true;
				active = data.active ?? false;
			}
		}
	}
	if (found) return active;
	// No persisted entry yet (e.g. --plan flag on a fresh session): fall back
	// to the plan extension's status key, which it sets while active.
	return footerData.getExtensionStatuses().has("plan-mode");
}

export function installFooter(ctx: ExtensionContext, pi: ExtensionAPI, usage: UsageService): FooterHandle {
	let tui: TUI | undefined;
	let disposed = false;

	const requestRender = () => {
		if (disposed) return;
		try {
			tui?.requestRender();
		} catch {
			// stale tui after session replacement — ignore
		}
	};

	function buildLine1Left(theme: Theme, withThinking: boolean): string {
		const modelId = ctx.model?.id ?? "no-model";
		let left = ` ${theme.fg("accent", ICONS.model)} ${theme.fg("accent", modelId)}`;
		if (withThinking) {
			const level = pi.getThinkingLevel();
			const color = THINKING_COLORS[level] ?? "thinkingText";
			left += ` ${theme.fg("dim", "·")} ${theme.fg(color, `${ICONS.thinking} ${level}`)}`;
		}
		return left;
	}

	function buildLine1Right(theme: Theme, withReset: boolean): string {
		const fg = (c: "success" | "warning" | "error" | "dim", t: string) => theme.fg(c, t);
		const segments: string[] = [];

		const provider = usageProviderOf(ctx.model);
		if (provider) {
			const reading = usage.getUsage(provider);
			if (reading) {
				const pct = formatPct(reading.remainingPct);
				const color = barColor(reading.remainingPct, "remaining");
				let seg = `${theme.fg("dim", reading.kind)} ${renderBar(fg, reading.remainingPct, { mode: "remaining" })} ${theme.fg(color, pct)}`;
				if (withReset) {
					const reset = formatResetsAt(reading);
					if (reset) seg += ` ${theme.fg("dim", `· ${ICONS.clock} resets ${reset}`)}`;
				}
				segments.push(seg);
			} else {
				segments.push(theme.fg("dim", "…"));
			}
		}

		const context = ctx.getContextUsage();
		if (context && typeof context.percent === "number") {
			const used = Math.max(0, Math.min(100, context.percent));
			const color = barColor(used, "used");
			segments.push(
				`${theme.fg("muted", ICONS.context)} ${renderBar(fg, used, { mode: "used" })} ${theme.fg(color, formatPct(used))}`,
			);
		} else {
			segments.push(theme.fg("dim", `${ICONS.context} …`));
		}

		return segments.join("   ");
	}

	function renderLine1(theme: Theme, width: number): string {
		// Drop sections in order: thinking level, then reset time.
		for (const [withThinking, withReset] of [
			[true, true],
			[true, false],
			[false, false],
		] as const) {
			const left = buildLine1Left(theme, withThinking);
			const right = buildLine1Right(theme, withReset);
			const gap = width - visibleWidth(left) - visibleWidth(right);
			if (gap >= 1) {
				return left + " ".repeat(gap) + right;
			}
		}
		return truncateToWidth(`${buildLine1Left(theme, false)} ${buildLine1Right(theme, false)}`, width);
	}

	function buildLine2Left(theme: Theme, footerData: ReadonlyFooterDataProvider, withCwd: boolean): string {
		const planActive = detectPlanMode(ctx, footerData);
		const badge = planActive
			? theme.inverse(theme.fg("warning", " PLAN "))
			: theme.fg("dim", " AUTO ");
		const parts = [badge];
		const branch = footerData.getGitBranch();
		if (branch) {
			parts.push(`${theme.fg("muted", ICONS.branch)} ${theme.fg("muted", branch)}`);
		}
		if (withCwd) {
			parts.push(theme.fg("dim", shortenCwd(ctx.cwd)));
		}
		return parts.join(" ");
	}

	function buildLine2Right(theme: Theme, footerData: ReadonlyFooterDataProvider): string {
		const statuses: string[] = [];
		for (const [key, text] of footerData.getExtensionStatuses()) {
			if (FILTERED_STATUS_KEYS.has(key)) continue;
			const clean = sanitizeStatus(text);
			if (clean) statuses.push(clean);
		}
		return statuses.join(theme.fg("dim", " · "));
	}

	function renderLine2(theme: Theme, footerData: ReadonlyFooterDataProvider, width: number): string {
		// Drop sections in order: cwd, then other extension statuses.
		for (const [withCwd, withStatuses] of [
			[true, true],
			[false, true],
			[false, false],
		] as const) {
			const left = buildLine2Left(theme, footerData, withCwd);
			const right = withStatuses ? buildLine2Right(theme, footerData) : "";
			if (!right) {
				if (visibleWidth(left) <= width) return left;
				continue;
			}
			const gap = width - visibleWidth(left) - visibleWidth(right);
			if (gap >= 2) {
				return left + " ".repeat(gap) + right;
			}
		}
		return truncateToWidth(buildLine2Left(theme, footerData, false), width);
	}

	ctx.ui.setFooter((t, theme, footerData) => {
		tui = t;
		const unsubBranch = footerData.onBranchChange(requestRender);
		return {
			render(width: number): string[] {
				return [renderLine1(theme, width), renderLine2(theme, footerData, width)];
			},
			invalidate() {
				// No cached lines — every render reads live state.
			},
			dispose() {
				unsubBranch();
			},
		};
	});

	const unsubUsage = usage.onChange(requestRender);
	const tick = setInterval(requestRender, TICK_INTERVAL_MS);
	pi.on("model_select", requestRender);
	pi.on("thinking_level_select", requestRender);
	pi.on("agent_end", requestRender);

	return {
		requestRender,
		dispose() {
			if (disposed) return;
			disposed = true;
			clearInterval(tick);
			unsubUsage();
			ctx.ui.setFooter(undefined);
		},
	};
}
