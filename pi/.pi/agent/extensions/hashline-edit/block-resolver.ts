/**
 * Tree-sitter backing for hashline's `N*` block anchors.
 *
 * hashline declares the `BlockResolver` seam but ships no implementation — the
 * host supplies one. `nodeChainAt` returns the named-node chain containing a
 * line, innermost first, listing single-line openers (decorators, attributes)
 * before the construct they decorate. Taking the widest node that *starts* on
 * the anchor line therefore resolves `@cache`/`def` as one block while still
 * refusing to reach upward into an enclosing scope the model did not name.
 */
import type { BlockResolver } from "@oh-my-pi/hashline";
import { nodeChainAt } from "@oh-my-pi/pi-natives";

export const resolveBlock: BlockResolver = ({ path, text, line }) => {
	let widest: { start: number; end: number } | null = null;
	for (const node of nodeChainAt({ code: text, path, line }) ?? []) {
		if (node.startLine !== line) continue;
		if (widest === null || node.endLine > widest.end) {
			widest = { start: node.startLine, end: node.endLine };
		}
	}
	// A single-line node is not a block; hashline turns null into guidance to use
	// an explicit `PUT N.=M:` range instead.
	return widest !== null && widest.end > widest.start ? widest : null;
};
