/**
 * Which edit contract is active.
 *
 * `replace` leaves Pi's built-in `read`/`edit` in place, so a hashline failure
 * mid-task is recoverable by restarting with `PI_EDIT_MODE=replace` rather than
 * uninstalling the extension.
 */
export type EditMode = "hashline" | "replace";

export function resolveEditMode(env: NodeJS.ProcessEnv = process.env): EditMode {
	return env.PI_EDIT_MODE?.trim().toLowerCase() === "replace" ? "replace" : "hashline";
}

/**
 * Which prompt variant `edit` ships as its description. The full upstream
 * prompt is the default; `PI_EDIT_PROMPT=compact` swaps in the ~60% smaller
 * variant so the two can be compared without uninstalling anything.
 */
export function promptVariant(env: NodeJS.ProcessEnv = process.env): "full" | "compact" {
	return env.PI_EDIT_PROMPT?.trim().toLowerCase() === "compact" ? "compact" : "full";
}

/**
 * Whether a whole-file read of a long source file is summarized down to its
 * declarations. Separate from the edit mode because it is the part most likely
 * to hide something the model needed: `PI_READ_SUMMARY=off` turns it off
 * without giving up the anchored edit contract.
 */
export function summariesEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
	return env.PI_READ_SUMMARY?.trim().toLowerCase() !== "off";
}
