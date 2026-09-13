/**
 * `read`, wrapped to emit hashline anchors.
 *
 * Pi's built-in read handles images, resizing, binary detection, truncation and
 * its own continuation notices; all of that is delegated. This adds the two
 * things the edit contract needs: a `[path#TAG]` header naming the snapshot the
 * model is looking at, and `N:` prefixes so it can address lines without
 * retyping them. The displayed line numbers are recorded against the snapshot,
 * which is what lets `edit` reject anchors into content it never showed.
 */
import { createReadToolDefinition, type ReadToolDetails } from "@earendil-works/pi-coding-agent";
import type { AgentToolResult, ExtensionContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { Filesystem } from "@oh-my-pi/hashline";
import type { TSchema } from "typebox";
import type { EditSessionState } from "./state.ts";

/**
 * Lines a hashline anchor can name. A trailing newline terminates the last line
 * rather than starting an empty one, so the split's final `""` is not
 * addressable — numbering it would offer the model an anchor that every edit
 * then rejects as out of bounds.
 */
function addressableLines(fullText: string): string[] {
	const lines = fullText.split("\n");
	if (fullText.endsWith("\n")) lines.pop();
	return lines;
}

/**
 * How many leading lines of the tool output are verbatim file content.
 *
 * The built-in appends advisories like `[Showing lines 1-4 of 500 ...]` after a
 * blank line, which must not be numbered or recorded as seen. Matching against
 * the file rather than the bracket shape keeps a source line that merely looks
 * like an advisory — a TOML `[section]`, a Markdown link reference — from being
 * mistaken for one.
 */
function countDisplayedLines(body: string[], file: string[], firstLine: number): number {
	let count = 0;
	while (count < body.length && body[count] === file[firstLine - 1 + count]) count++;
	return count;
}

export function createAnchoredReadTool(
	cwd: string,
	fs: Filesystem,
	state: EditSessionState,
): ToolDefinition<TSchema, ReadToolDetails | undefined> {
	const builtin = createReadToolDefinition(cwd) as ToolDefinition<TSchema, ReadToolDetails | undefined>;

	return {
		...builtin,
		description: `${builtin.description}\n\nText files come back as a \`[path#TAG]\` header followed by \`N:line\` rows. Copy that header verbatim into \`edit\`; never invent a tag. Only the lines shown here can be edited — re-read a range before anchoring into it.`,
		async execute(toolCallId, params, signal, onUpdate, ctx: ExtensionContext) {
			const result = await builtin.execute(toolCallId, params, signal, onUpdate, ctx);
			return anchorResult(result, params as { path: string; offset?: number }, fs, state);
		},
	};
}

async function anchorResult(
	result: AgentToolResult<ReadToolDetails | undefined>,
	params: { path: string; offset?: number },
	fs: Filesystem,
	state: EditSessionState,
): Promise<AgentToolResult<ReadToolDetails | undefined>> {
	// Images and any other non-text shape pass through untouched: there is no
	// editable line-addressed content to anchor.
	const [block, ...rest] = result.content;
	if (rest.length > 0 || block?.type !== "text") return result;

	let fullText: string;
	try {
		fullText = await fs.readText(params.path);
	} catch {
		// Directories, unreadable paths, anything the snapshot store cannot own.
		return result;
	}

	const firstLine = params.offset ?? 1;
	const body = block.text.split("\n");
	const displayed = countDisplayedLines(body, addressableLines(fullText), firstLine);
	// Nothing matched: the file changed under the read, or the built-in returned
	// an advisory instead of content. Minting a tag here would claim to have
	// shown content that was never displayed, so leave the result unanchored.
	if (displayed === 0) return result;

	const seen = Array.from({ length: displayed }, (_, index) => firstLine + index);
	const numbered = seen.map((line, index) => `${line}:${body[index]}`);
	const trailing = body.slice(displayed);
	const tag = state.snapshots.record(fs.canonicalPath(params.path), fullText, seen);

	const anchored = [`[${params.path}#${tag}]`, ...numbered, ...trailing].join("\n");
	return { ...result, content: [{ type: "text", text: anchored }] };
}
