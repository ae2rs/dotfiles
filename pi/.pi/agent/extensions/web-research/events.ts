/**
 * The whole contract with `codex exec --json`. The Codex CLI moves fast, so
 * this is kept in one place: if an upgrade renames these events, parsing
 * yields an empty answer and the caller reports that rather than staying quiet.
 */

export type ResearchRun = {
	/** Last agent message; runs often open with a preamble before the real answer. */
	answer: string;
	/** Search queries and opened URLs, in order. */
	searches: string[];
	usage?: Record<string, number>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseRun(stdout: string): ResearchRun {
	const searches: string[] = [];
	let answer = "";
	let usage: Record<string, number> | undefined;

	for (const line of stdout.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed.startsWith("{")) continue;

		let event: unknown;
		try {
			event = JSON.parse(trimmed);
		} catch {
			continue; // Interleaved non-JSON output is not fatal.
		}
		if (!isRecord(event)) continue;

		if (event.type === "turn.completed" && isRecord(event.usage)) {
			usage = event.usage as Record<string, number>;
			continue;
		}

		// `item.started` repeats each item with empty fields; only completions carry content.
		if (event.type !== "item.completed" || !isRecord(event.item)) continue;
		const item = event.item;

		if (item.type === "web_search") {
			// `query` carries the search terms, or the URL when the agent opens a page.
			const action = isRecord(item.action) ? item.action.query : undefined;
			const query = item.query || action;
			if (typeof query === "string" && query) searches.push(query);
		} else if (item.type === "agent_message" && typeof item.text === "string") {
			answer = item.text;
		}
	}

	return { answer, searches, usage };
}
