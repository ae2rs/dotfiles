import { describe, expect, test } from "bun:test";
import { parseRun } from "../web-research/events.ts";

/** Event lines captured verbatim from `codex exec --json` runs. */
const started = (id: string) =>
	JSON.stringify({
		type: "item.started",
		item: { id, type: "web_search", query: "", action: { type: "other" } },
	});

const search = (id: string, query: string) =>
	JSON.stringify({
		type: "item.completed",
		item: { id, type: "web_search", query, action: { type: "search", query } },
	});

const message = (text: string) =>
	JSON.stringify({ type: "item.completed", item: { id: "item_1", type: "agent_message", text } });

const completed = JSON.stringify({
	type: "turn.completed",
	usage: { input_tokens: 27179, cached_input_tokens: 17920, output_tokens: 90 },
});

describe("codex exec --json parsing", () => {
	test("takes the last agent message, since runs open with a preamble", () => {
		const stdout = [
			JSON.stringify({ type: "thread.started", thread_id: "01a0" }),
			JSON.stringify({ type: "turn.started" }),
			message("I'll verify this against the official release information."),
			search("exec-1", "site:sqlite.org latest version"),
			message("The newest SQLite version is **3.53.4**."),
			completed,
		].join("\n");

		expect(parseRun(stdout).answer).toBe("The newest SQLite version is **3.53.4**.");
	});

	test("collects searches in order and ignores the empty started events", () => {
		const stdout = [
			started("exec-1"),
			search("exec-1", "tokio releases 2026"),
			started("exec-2"),
			search("exec-2", "crates.io download counts"),
			message("answer"),
		].join("\n");

		expect(parseRun(stdout).searches).toEqual(["tokio releases 2026", "crates.io download counts"]);
	});

	test("records an opened page, which arrives with a URL instead of a query", () => {
		const stdout = [
			JSON.stringify({
				type: "item.completed",
				item: {
					id: "exec-3",
					type: "web_search",
					query: "https://crates.io/crates/tokio",
					action: { type: "open_page", url: "https://crates.io/crates/tokio" },
				},
			}),
			message("answer"),
		].join("\n");

		expect(parseRun(stdout).searches).toEqual(["https://crates.io/crates/tokio"]);
	});

	test("falls back to the action query when the item carries none", () => {
		const stdout = [
			JSON.stringify({
				type: "item.completed",
				item: { id: "exec-4", type: "web_search", query: "", action: { query: "fallback terms" } },
			}),
			message("answer"),
		].join("\n");

		expect(parseRun(stdout).searches).toEqual(["fallback terms"]);
	});

	test("reports usage from the completed turn", () => {
		expect(parseRun([message("answer"), completed].join("\n")).usage).toMatchObject({
			input_tokens: 27179,
			output_tokens: 90,
		});
	});

	test("survives interleaved non-JSON output", () => {
		const stdout = [
			"Reading additional input from stdin...",
			"",
			message("answer"),
			"{ broken",
		].join("\n");

		expect(parseRun(stdout).answer).toBe("answer");
	});

	test("returns an empty answer when no agent message arrives, so callers can fail loudly", () => {
		const run = parseRun([started("exec-1"), search("exec-1", "q")].join("\n"));

		expect(run.answer).toBe("");
		expect(run.usage).toBeUndefined();
	});
});
