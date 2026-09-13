/**
 * Structural summary for whole-file reads: keep the declarations, elide the
 * statements.
 *
 * Walks the file with tree-sitter, keeping the line that opens each multi-line
 * construct and the line that closes it, and descending into the body so nested
 * declarations — methods on a class, closures inside a function — keep their own
 * signatures. Only runs of plain statements collapse to a `…` row.
 *
 * Kept lines keep their real line numbers, because those numbers are what `edit`
 * anchors to. Elided lines are deliberately not recorded as seen, which makes
 * them un-editable until re-read: a summary can hide something, so the edit
 * contract refuses to act on what it hid.
 */
import { blockRangeAt } from "@oh-my-pi/pi-natives";

/** Below this a file is cheap enough to show whole. */
const MIN_LINES = 100;
/** Bodies shorter than this cost less to show than to elide and re-read. */
const MIN_ELIDABLE_BODY = 6;
/** Nesting past this is implementation detail, not structure. */
const MAX_DEPTH = 3;
/** Guards against pathological parses, matching omp's own summarizer. */
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_LINES = 20_000;

/** Prose is read for its content, not its structure. */
const PROSE = /\.(md|markdown|mdx|txt|rst|adoc)$/i;

export interface Span {
	start: number;
	end: number;
}

export interface Summary {
	/** Kept rows, in file order, each with its original 1-indexed line number. */
	kept: { line: number; text: string }[];
	/** Inclusive ranges replaced by `…`. */
	elided: Span[];
}

export function canSummarize(path: string, fullText: string, lineCount: number): boolean {
	return (
		!PROSE.test(path) &&
		lineCount >= MIN_LINES &&
		lineCount <= MAX_LINES &&
		Buffer.byteLength(fullText, "utf8") <= MAX_BYTES
	);
}

class Walker {
	readonly kept: { line: number; text: string }[] = [];
	readonly elided: Span[] = [];

	constructor(
		private readonly code: string,
		private readonly path: string,
		private readonly lines: string[],
	) {}

	keep(line: number): void {
		this.kept.push({ line, text: this.lines[line - 1] ?? "" });
	}

	elide(start: number, end: number): void {
		if (end >= start) this.elided.push({ start, end });
	}

	/**
	 * At the top level every line survives unless it is inside an elided body;
	 * deeper down only the lines that open a construct do, so statement runs
	 * collapse. That difference is what keeps a file's imports and constants
	 * visible while hiding the insides of its functions.
	 */
	walk(from: number, to: number, depth: number): void {
		let pending: number | undefined;
		const flushPending = (through: number) => {
			if (pending === undefined) return;
			this.elide(pending, through);
			pending = undefined;
		};

		let line = from;
		while (line <= to) {
			const block = blockRangeAt({ code: this.code, path: this.path, line });
			const end = block === null ? 0 : Math.min(block.endLine, to);
			const body = { start: line + 1, end: end - 1 };
			const elidable = block !== null && end > line && body.end - body.start + 1 >= MIN_ELIDABLE_BODY;

			if (!elidable) {
				if (depth === 0) this.keep(line);
				else pending ??= line;
				line++;
				continue;
			}

			flushPending(line - 1);
			this.keep(line);
			if (depth + 1 < MAX_DEPTH) this.walk(body.start, body.end, depth + 1);
			else this.elide(body.start, body.end);
			this.keep(end);
			line = end + 1;
		}
		flushPending(to);
	}
}

/**
 * Returns null when the file yielded no elision worth making — an unrecognized
 * language, a flat config file, a module of one-liners. Callers then show the
 * file verbatim rather than paying for a summary that saved nothing.
 */
export function summarize(path: string, code: string, lines: string[]): Summary | null {
	const walker = new Walker(code, path, lines);
	walker.walk(1, lines.length, 0);
	if (walker.elided.length === 0) return null;
	walker.elided.sort((a, b) => a.start - b.start);
	return { kept: walker.kept, elided: walker.elided };
}

/**
 * How to get back exactly what was hidden, in this `read`'s own vocabulary.
 * Pi takes `offset`/`limit`, not omp's `path:5-16,40-80` selector syntax, so the
 * footer names the widest elided span as a concrete call the model can copy.
 */
export function recoveryHint(elided: Span[]): string {
	const widest = elided.reduce((best, span) => (span.end - span.start > best.end - best.start ? span : best));
	return `offset=${widest.start} limit=${widest.end - widest.start + 1}`;
}
