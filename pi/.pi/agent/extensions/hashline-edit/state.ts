/**
 * State shared by the anchored `read` and the hashline `edit` for one Pi
 * process: the snapshot store that mints and resolves `#TAG`s, the clipboard
 * backing `CUT`/`PUT @name` across calls, and the repeat counter behind the
 * no-op loop guard.
 */
import { InMemorySnapshotStore, type Clipboard } from "@oh-my-pi/hashline";

/**
 * Escalating responses to a byte-identical patch. hashline reports such a
 * section as `op: "noop"` rather than failing, because only the host knows
 * whether it is a stale retry or a deliberate re-assertion. Repeating one means
 * the model is looping on an edit it believes it has not made yet.
 */
const NOOP_LOOP_LIMIT = 3;

export class EditSessionState {
	readonly snapshots = new InMemorySnapshotStore();
	/** Starts empty; the patcher forks it per batch and publishes landed cuts back. */
	readonly clipboard: Clipboard = {};

	#lastNoopPayload: string | undefined;
	#noopRepeats = 0;

	/**
	 * Count consecutive no-op applies of the same payload. Returns the repeat
	 * count so the caller can escalate its guidance rather than repeating a
	 * message the model has already failed to act on.
	 */
	recordNoop(payload: string): number {
		this.#noopRepeats = payload === this.#lastNoopPayload ? this.#noopRepeats + 1 : 1;
		this.#lastNoopPayload = payload;
		return this.#noopRepeats;
	}

	/** Any successful edit clears the loop guard. */
	recordProgress(): void {
		this.#lastNoopPayload = undefined;
		this.#noopRepeats = 0;
	}

	noopIsLooping(repeats: number): boolean {
		return repeats >= NOOP_LOOP_LIMIT;
	}
}
