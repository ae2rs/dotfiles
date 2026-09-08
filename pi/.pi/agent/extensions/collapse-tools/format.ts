/**
 * Pure formatting helpers for the collapse-tools extension, kept free of
 * runtime dependencies so they can be unit-tested with `bun test`.
 */

/** "read ×2 · grep" for a first-seen-ordered map of tool name → call count. */
export function formatSummary(counts: Map<string, number>): string {
	return [...counts].map(([name, n]) => (n > 1 ? `${name} ×${n}` : name)).join(" · ");
}

const COMMAND_PREVIEW_LIMIT = 120;

/** First meaningful line of a shell command, bounded for a one-line display. */
export function commandPreview(command: string): string {
	const firstLine =
		command
			.split("\n")
			.find((line) => line.trim())
			?.trim() ?? "";
	return firstLine.length > COMMAND_PREVIEW_LIMIT
		? `${firstLine.slice(0, COMMAND_PREVIEW_LIMIT)}…`
		: firstLine;
}

export interface DiffStats {
	added: number;
	removed: number;
}

/** +/- line counts of a unified-style diff, ignoring file headers. */
export function diffStats(diff: string): DiffStats {
	let added = 0;
	let removed = 0;
	for (const line of diff.split("\n")) {
		if (line.startsWith("+++") || line.startsWith("---")) continue;
		if (line.startsWith("+")) added++;
		else if (line.startsWith("-")) removed++;
	}
	return { added, removed };
}

/** Stats for a freshly written file: every content line is an addition. */
export function writeStats(content: string): DiffStats {
	return { added: content === "" ? 0 : content.split("\n").length, removed: 0 };
}

/** "(+a −b)" for a one-line display, omitting zero sides and empty stats. */
export function formatStats(stats: DiffStats | undefined): string {
	if (!stats || (stats.added === 0 && stats.removed === 0)) return "";
	if (stats.removed === 0) return `(+${stats.added})`;
	if (stats.added === 0) return `(−${stats.removed})`;
	return `(+${stats.added} −${stats.removed})`;
}

/** Strip the cwd prefix for display; leave outside-cwd paths untouched. */
export function relativePath(cwd: string, path: string): string {
	return path.startsWith(`${cwd}/`) ? path.slice(cwd.length + 1) : path;
}
