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
