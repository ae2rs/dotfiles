/**
 * Filesystem seam bound to Pi's session cwd.
 *
 * hashline's `NodeFilesystem` takes paths as-is and canonicalizes with
 * `path.resolve`, which resolves against `process.cwd()` — not the session cwd,
 * which Pi sets per tool call. Resolving here keeps one canonical key per file,
 * so the snapshot a `read` recorded still resolves when `edit` names the same
 * file from a different working directory.
 */
import * as pathModule from "node:path";
import { NodeFilesystem, type WriteResult } from "@oh-my-pi/hashline";

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
		return this.#abs(path);
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
