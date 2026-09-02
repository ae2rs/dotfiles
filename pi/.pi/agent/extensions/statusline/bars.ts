/**
 * bars — pre-colored progress bar renderer for the statusline footer.
 *
 * Bars are plain block elements (▓ filled / ░ empty) so they have no font
 * dependency. Two color modes:
 *   - "remaining" (subscription headroom): green > 30 %, yellow 10–30 %, red < 10 %
 *   - "used" (context window): green < 60 %, yellow 60–80 %, red > 80 %
 */

export type BarMode = "remaining" | "used";

type Fg = (color: "success" | "warning" | "error" | "dim", text: string) => string;

export function barColor(pct: number, mode: BarMode): "success" | "warning" | "error" {
	if (mode === "remaining") {
		return pct > 30 ? "success" : pct >= 10 ? "warning" : "error";
	}
	return pct < 60 ? "success" : pct <= 80 ? "warning" : "error";
}

/** Render an N-cell bar for a 0–100 percentage, with theme colors applied. */
export function renderBar(fg: Fg, pct: number, opts?: { width?: number; mode?: BarMode }): string {
	const width = opts?.width ?? 8;
	const mode = opts?.mode ?? "remaining";
	const clamped = Math.max(0, Math.min(100, pct));
	const filled = Math.round((clamped / 100) * width);
	return fg(barColor(clamped, mode), "▓".repeat(filled)) + fg("dim", "░".repeat(width - filled));
}

export function formatPct(pct: number): string {
	return `${Math.round(pct)}%`;
}
