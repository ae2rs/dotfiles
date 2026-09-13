/**
 * Filesystem seam bound to Pi's session cwd.
 *
 * hashline's `NodeFilesystem` takes paths as-is and canonicalizes with
 * `path.resolve`, which resolves against `process.cwd()` — not the session cwd,
 * which Pi sets per tool call. Resolving here keeps one canonical key per file,
 * so the snapshot a `read` recorded still resolves when `edit` names the same
 * file from a different working directory.
 */
import { realpathSync } from "node:fs";
import * as pathModule from "node:path";
import { NodeFilesystem, type WriteResult } from "@oh-my-pi/hashline";

/**
 * Absolute path with symlinks resolved, so one file has exactly one snapshot
 * key no matter which route named it — `/tmp` vs `/private/tmp` on macOS, or a
 * linked worktree. Falls back through the parent directory for paths that do
 * not exist yet, which is the normal case for a move destination.
 */
function canonicalize(path: string): string {
	try {
		return realpathSync(path);
	} catch {
		const parent = pathModule.dirname(path);
		try {
			return pathModule.join(realpathSync(parent), pathModule.basename(path));
		} catch {
			return path;
		}
	}
}

export class SessionFilesystem extends NodeFilesystem {
	readonly #cwd: string;

	constructor(cwd: string) {
		super();
		this.#cwd = cwd;
	}

	#abs(path: string): string {
		return pathModule.resolve(this.#cwd, path);
	}

	override canonicalPath(path: string): string {
		return canonicalize(this.#abs(path));
	}

	override readText(path: string): Promise<string> {
		return super.readText(this.#abs(path));
	}

	override readBinary(path: string): Promise<Uint8Array> {
		return super.readBinary(this.#abs(path));
	}

	override writeText(path: string, content: string): Promise<WriteResult> {
		return super.writeText(this.#abs(path), content);
	}

	override delete(path: string): Promise<void> {
		return super.delete(this.#abs(path));
	}

	override move(from: string, to: string, content?: string): Promise<void> {
		return super.move(this.#abs(from), this.#abs(to), content);
	}

	override exists(path: string): Promise<boolean> {
		return super.exists(this.#abs(path));
	}
}
