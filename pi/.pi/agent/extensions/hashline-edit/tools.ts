/**
 * Tool factories for the hashline edit contract, shaped like Pi's own
 * `create*ToolDefinition(cwd)` so `collapse-tools.ts` can register and render
 * them the same way it does the built-ins.
 *
 * Pi rejects two extensions registering the same tool name, so this directory
 * deliberately exposes factories instead of being an extension itself —
 * `collapse-tools.ts` stays the single registrar of `read` and `edit`.
 *
 * The snapshot store is shared across working directories on purpose: it is
 * keyed by absolute path, so a tag minted by a read in one cwd stays valid for
 * an edit issued from another.
 */
import { createAnchoredReadTool } from "./read.ts";
import { createHashlineEditTool } from "./edit.ts";
import { SessionFilesystem } from "./session-fs.ts";
import { EditSessionState } from "./state.ts";

const state = new EditSessionState();

export function createAnchoredRead(cwd: string) {
	return createAnchoredReadTool(cwd, new SessionFilesystem(cwd), state);
}

export function createHashlineEdit(cwd: string) {
	return createHashlineEditTool(new SessionFilesystem(cwd), state);
}

export { resolveEditMode } from "./mode.ts";
