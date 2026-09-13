/**
 * Tree-sitter backing for hashline's `N*` block anchors.
 *
 * hashline declares the `BlockResolver` seam but ships no implementation — the
 * host supplies one. `blockRangeAt` returns the outermost named node beginning
 * on the anchor line, which is what a block anchor means: `PUT 1*:` on a Python
 * decorator sweeps the decorated function with it, because the grammar nests
 * both under one node starting on that line.
 *
 * Where a language models leading attributes as siblings rather than parents —
 * Rust's `#[derive(...)]` is the common case — no multi-line node begins on the
 * attribute line and this returns null. hashline turns that into guidance to use
 * an explicit `PUT N.=M:` range, which is the documented fallback.
 */
import type { BlockResolver } from "@oh-my-pi/hashline";
import { blockRangeAt } from "@oh-my-pi/pi-natives";

export const resolveBlock: BlockResolver = ({ path, text, line }) => {
	const block = blockRangeAt({ code: text, path, line });
	// A single-line node is not a block; hashline asks for an explicit range.
	if (block === null || block.endLine <= block.startLine) return null;
	return { start: block.startLine, end: block.endLine };
};
