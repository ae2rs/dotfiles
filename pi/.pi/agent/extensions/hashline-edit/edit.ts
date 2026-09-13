/**
 * `edit`, replaced by hashline's line-anchored patch language.
 *
 * The model addresses lines by number under the `[path#TAG]` header that `read`
 * showed it, and supplies only final content — it never retypes the text it is
 * replacing. The tag is what makes that safe: it names the exact snapshot the
 * anchors belong to, so an edit against a file that moved under the model is
 * merged when provably safe and rejected otherwise.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	generateDiffString,
	generateUnifiedPatch,
	type EditToolDetails,
	type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Patch, Patcher, type Filesystem, type PatchSectionResult } from "@oh-my-pi/hashline";
import { Type, type Static } from "typebox";
import { resolveBlock } from "./block-resolver.ts";
import { promptVariant } from "./mode.ts";
import type { EditSessionState } from "./state.ts";

/**
 * hashline's own model-facing contract. Shipped with the package and tuned
 * upstream per model, so it is loaded verbatim rather than paraphrased. Pi's
 * `promptGuidelines` never reach a `pi-claude` child, so this has to ride in
 * the tool description.
 */
const PROMPT_PATH =
	promptVariant() === "compact"
		? join(import.meta.dirname, "hashline-compact.md")
		: join(import.meta.dirname, "node_modules", "@oh-my-pi", "hashline", "src", "prompt.md");
const HASHLINE_PROMPT = readFileSync(PROMPT_PATH, "utf8");

const editSchema = Type.Object({
	input: Type.String({
		description: "One or more [PATH#TAG] sections of hashline operations.",
	}),
});

type EditParams = Static<typeof editSchema>;

function describeSection(section: PatchSectionResult): string {
	const lines = [section.header];
	if (section.moveDest) lines.push(`Moved to ${section.moveDest}`);
	if (section.op === "delete") lines.push("Deleted.");
	for (const resolution of section.blockResolutions ?? []) {
		lines.push(`Block ${resolution.op} resolved to lines ${resolution.start}-${resolution.end}`);
	}
	if (section.warnings.length > 0) lines.push(`Warnings:\n${section.warnings.join("\n")}`);
	return lines.join("\n");
}

/**
 * A byte-identical patch means the model believes it made a change it did not.
 * Escalate on repeats: the same guidance twice has already failed to land.
 */
function noopMessage(repeats: number, looping: boolean): string {
	if (looping) {
		return `This exact patch has now produced no change ${repeats} times. The file already contains what you are trying to write. Stop re-sending it: re-read the file and confirm what is actually there before editing again.`;
	}
	return "This patch produced no change — the file already matches it byte for byte. Re-read the file to see its current content rather than re-sending the same edit.";
}

export function createHashlineEditTool(
	fs: Filesystem,
	state: EditSessionState,
): ToolDefinition<typeof editSchema, EditToolDetails | undefined> {
	const patcher = new Patcher({
		fs,
		snapshots: state.snapshots,
		blockResolver: resolveBlock,
		clipboard: state.clipboard,
	});

	return {
		name: "edit",
		label: "edit",
		description: `Edit existing files with a line-anchored patch. Use \`write\` to create a new file.\n\n${HASHLINE_PROMPT}`,
		parameters: editSchema,
		async execute(_toolCallId, { input }: EditParams) {
			let result;
			try {
				result = await patcher.apply(Patch.parse(input));
			} catch (error) {
				// Parse failures, stale tags and anchor violations all arrive here with
				// messages written for the model; pass them through unembellished.
				return {
					content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
					isError: true,
					details: undefined,
				};
			}

			if (result.sections.every((section) => section.op === "noop")) {
				const repeats = state.recordNoop(input);
				return {
					content: [{ type: "text", text: noopMessage(repeats, state.noopIsLooping(repeats)) }],
					isError: true,
					details: undefined,
				};
			}
			state.recordProgress();

			// One patch can touch several files — a CUT in one section feeding a
			// PUT in another. Report every section so the TUI's diff stats cover the
			// whole edit rather than just wherever the patch happened to start.
			const diffs = result.sections.map((section) => generateDiffString(section.before, section.after));
			return {
				content: [{ type: "text", text: result.sections.map(describeSection).join("\n\n") }],
				details: {
					diff: diffs.map((entry) => entry.diff).join("\n"),
					patch: result.sections
						.map((section) => generateUnifiedPatch(section.path, section.before, section.after))
						.join("\n"),
					firstChangedLine: diffs.find((entry) => entry.firstChangedLine !== undefined)?.firstChangedLine,
				},
			};
		},
	};
}
