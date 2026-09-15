/**
 * Text preparation and viewport maths for the /hooks output pager.
 *
 * Detached commands emit raw terminal output: colour codes, progress bars that
 * rewrite the line with \r, and cursor movement. Replaying that inside Pi's own
 * TUI frame would corrupt it, so output is flattened to printable text here and
 * the pager colours whole lines by stream instead. Wrapping stays with the
 * caller, which has pi-tui's cell-accurate wrapper.
 */

export interface OutputSegment {
	err: boolean;
	text: string;
}

export interface OutputLine {
	text: string;
	err: boolean;
}

// Terminal escape sequences: CSI (ESC [ ... final byte), OSC (ESC ] ... BEL or ST),
// and the two-byte escapes. Stripped wholesale; the pager re-colours by stream.
const ESCAPE_SEQUENCE =
	/\u001b\[[0-9;?]*[ -\/]*[@-~]|\u001b\][\s\S]*?(?:\u0007|\u001b\\)|\u001b[@-Z\\-_]/g;
const CONTROL_CHAR = /[\u0000-\u0008\u000b-\u001f\u007f]/g;

/** Reduce one raw line to printable text, keeping only the last \r overwrite. */
export function flatten(line: string): string {
	const overwrites = line.split("\r").filter((part) => part !== "");
	return (overwrites[overwrites.length - 1] ?? "")
		.replace(ESCAPE_SEQUENCE, "")
		.replace(/\t/g, "    ")
		.replace(CONTROL_CHAR, "");
}

/** Split interleaved stdout/stderr segments into flattened lines. */
export function toLines(segments: readonly OutputSegment[]): OutputLine[] {
	const lines: OutputLine[] = [];
	let pending = "";
	let pendingErr = false;
	const flush = () => {
		lines.push({ text: flatten(pending), err: pendingErr });
		pending = "";
		pendingErr = false;
	};
	for (const segment of segments) {
		const parts = segment.text.split("\n");
		for (const [index, part] of parts.entries()) {
			if (index > 0) flush();
			if (part === "") continue;
			pending += part;
			pendingErr ||= segment.err;
		}
	}
	if (pending !== "") flush();
	return lines;
}

/** Largest scroll offset that still fills the viewport. */
export function maxScroll(total: number, viewport: number): number {
	return Math.max(0, total - viewport);
}

/** Keep a scroll offset inside the scrollable range. */
export function clampScroll(scroll: number, total: number, viewport: number): number {
	return Math.max(0, Math.min(scroll, maxScroll(total, viewport)));
}
