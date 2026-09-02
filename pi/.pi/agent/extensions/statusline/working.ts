/**
 * working — adaptive working indicator for streaming.
 *
 * MDI clock frames (󰪞…󰪥) at 120 ms, colored by how long ago the last token
 * arrived: green < 10 s, yellow < 30 s, red ≥ 30 s. The working message gets
 * an elapsed-time suffix (󰅐 12.3s) that ticks while the agent runs.
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { ICONS, WORKING_FRAMES } from "./icons.ts";

type Tone = "green" | "yellow" | "red";
const TONE_COLORS = { green: "success", yellow: "warning", red: "error" } as const;
const FRAME_INTERVAL_MS = 120;
const TICK_MS = 250;

function formatElapsed(ms: number): string {
	if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
	const minutes = Math.floor(ms / 60_000);
	const seconds = Math.floor((ms % 60_000) / 1000);
	return `${minutes}m ${seconds}s`;
}

export function setupWorkingIndicator(pi: ExtensionAPI): void {
	let timer: ReturnType<typeof setInterval> | undefined;
	let lastTokenAt = 0;
	let agentStartAt = 0;
	let tone: Tone | undefined;

	function applyIndicator(ctx: ExtensionContext, next: Tone): void {
		tone = next;
		try {
			ctx.ui.setWorkingIndicator({
				frames: WORKING_FRAMES.map((frame) => ctx.ui.theme.fg(TONE_COLORS[next], frame)),
				intervalMs: FRAME_INTERVAL_MS,
			});
		} catch {
			// stale ctx after session replacement/reload — ignore
		}
	}

	function tick(ctx: ExtensionContext): void {
		const now = Date.now();
		const next: Tone = now - lastTokenAt < 10_000 ? "green" : now - lastTokenAt < 30_000 ? "yellow" : "red";
		if (next !== tone) applyIndicator(ctx, next);
		if (agentStartAt) {
			try {
				ctx.ui.setWorkingMessage(`Working…  ${ICONS.clock} ${formatElapsed(now - agentStartAt)}`);
			} catch {
				// stale ctx — ignore
			}
		}
	}

	function stopTimer(): void {
		if (timer) clearInterval(timer);
		timer = undefined;
	}

	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode !== "tui") return;
		stopTimer();
		tone = undefined;
		agentStartAt = 0;
		// Defer so the SDK's resetExtensionUI() (which restores the default
		// indicator) runs before we override it.
		setTimeout(() => {
			try {
				if (ctx.mode === "tui") applyIndicator(ctx, "green");
			} catch {
				// stale ctx — ignore
			}
		}, 0);
	});

	pi.on("agent_start", (_event, ctx) => {
		if (ctx.mode !== "tui") return;
		stopTimer();
		agentStartAt = Date.now();
		lastTokenAt = agentStartAt;
		applyIndicator(ctx, "green");
		tick(ctx);
		timer = setInterval(() => tick(ctx), TICK_MS);
	});

	pi.on("message_update", () => {
		lastTokenAt = Date.now();
	});

	pi.on("agent_end", (_event, ctx) => {
		stopTimer();
		agentStartAt = 0;
		// Restore the default working message shortly after streaming ends.
		setTimeout(() => {
			try {
				ctx.ui.setWorkingMessage();
			} catch {
				// stale ctx — ignore
			}
		}, 2000);
	});

	pi.on("session_shutdown", () => stopTimer());
}
