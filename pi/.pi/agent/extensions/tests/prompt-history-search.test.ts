import { describe, expect, test } from "bun:test";
import type { Prompt } from "../prompt-history/data.ts";
import { searchPrompts } from "../prompt-history/search.ts";

/** Prompts arrive newest first, so later arguments are older. */
function history(...texts: Array<string | Partial<Prompt>>): Prompt[] {
	return texts.map((entry, index) => ({
		text: "",
		timestamp: texts.length - index,
		cwd: "/work/project",
		sessionFile: "/sessions/project/session.jsonl",
		count: 1,
		...(typeof entry === "string" ? { text: entry } : entry),
	}));
}

function ranked(prompts: Prompt[], query: string): string[] {
	return searchPrompts(prompts, query).map((match) => match.prompt.text);
}

describe("prompt search ranking", () => {
	test("returns every prompt in recency order when the query is blank", () => {
		const prompts = history("newest", "older");
		expect(ranked(prompts, "   ")).toEqual(["newest", "older"]);
	});

	test("ranks a literal hit above a scattered one, whatever their positions", () => {
		// The regression this ranking exists for: a greedy subsequence scan scores
		// "please plan" on p-l-a-...-n and never notices the literal word.
		const prompts = history("pull a note", "please plan");
		expect(ranked(prompts, "plan")).toEqual(["please plan", "pull a note"]);
	});

	test("ranks an exact phrase above prompts that merely contain every term", () => {
		const scattered = "taskplane is still here, please remove it";
		const prompts = history(scattered, "remove taskplane");
		expect(ranked(prompts, "remove taskplane")).toEqual(["remove taskplane", scattered]);
	});

	test("ignores term order but not phrase adjacency", () => {
		const prompts = history("search the reverse index", "reverse search");
		expect(ranked(prompts, "reverse search")).toEqual(ranked(prompts, "search reverse"));
		expect(ranked(prompts, "reverse search")[0]).toBe("reverse search");
	});

	test("prefers hits that start a word and hits that appear early", () => {
		expect(ranked(history("unplanned work", "plan the work"), "plan")[0]).toBe("plan the work");
		expect(ranked(history("first do the audit then plan", "plan the audit"), "plan")[0]).toBe(
			"plan the audit",
		);
	});

	test("still finds typos, but only below every literal match", () => {
		const prompts = history("remove taslkplane", "remove taskplane");
		expect(ranked(prompts, "taskplane")).toEqual(["remove taskplane", "remove taslkplane"]);
	});

	test("scores a near-contiguous typo above a scattered subsequence", () => {
		const prompts = history("t need to ask if the plane is here", "taslkplane");
		expect(ranked(prompts, "taskplane")).toEqual([
			"taslkplane",
			"t need to ask if the plane is here",
		]);
	});

	test("does not let a stray early character inflate a typo's span", () => {
		// The leading "t" is 22 characters from the rest of the match. Measured
		// from there the span is 33 and loses to the scattered prompt below; the
		// tight "taslkplane" window it should actually measure spans 10.
		const typo = "t is the issue. remove taslkplane please";
		const scattered = "take some kind of place and name everything";
		expect(ranked(history(scattered, typo), "taskplane")).toEqual([typo, scattered]);
	});

	test("bounds the subsequence tier to the start of a long prompt", () => {
		// Literal hits stay findable at any depth; only the noisy subsequence
		// tier is bounded, so both prompts here avoid containing "zq" outright.
		const reachable = `z${"a".repeat(100)}q${"a".repeat(2000)}`;
		const beyondLimit = `z${"a".repeat(2100)}q`;
		expect(ranked(history(reachable), "zq")).toEqual([reachable]);
		expect(ranked(history(beyondLimit), "zq")).toEqual([]);
	});

	test("finds a literal hit however deep in a long prompt it sits", () => {
		const deep = `${"a".repeat(5000)} clippy`;
		expect(ranked(history(deep), "clippy")).toEqual([deep]);
	});

	test("excludes prompts missing any term", () => {
		expect(ranked(history("only the first term here"), "term absent")).toEqual([]);
	});

	test("breaks score ties by reuse count, then by recency", () => {
		const prompts = history(
			{ text: "run the tests newest", count: 1 },
			{ text: "run the tests reused", count: 4 },
			{ text: "run the tests oldest", count: 1 },
		);
		expect(ranked(prompts, "run the tests")).toEqual([
			"run the tests reused",
			"run the tests newest",
			"run the tests oldest",
		]);
	});

	test("matches case-insensitively", () => {
		expect(ranked(history("Plan And Implement"), "plan and")).toEqual(["Plan And Implement"]);
	});
});

describe("prompt search display", () => {
	test("shows the matching line rather than the first one, with its match ranges", () => {
		const prompts = history("a title line\nsome context\nplease run clippy here");
		const [match] = searchPrompts(prompts, "clippy");
		expect(match.line).toBe("please run clippy here");
		expect(match.ranges).toEqual([[11, 17]]);
		expect(match.line.slice(11, 17)).toBe("clippy");
	});

	test("prefers the line covering the most terms and highlights each of them", () => {
		const prompts = history("mentions bazel only\nboth bazel and clippy\nmentions clippy only");
		const [match] = searchPrompts(prompts, "bazel clippy");
		expect(match.line).toBe("both bazel and clippy");
		expect(match.ranges.map(([start, end]) => match.line.slice(start, end))).toEqual([
			"bazel",
			"clippy",
		]);
	});

	test("merges overlapping ranges from repeated and nested terms", () => {
		const prompts = history("plan the plan carefully");
		const [match] = searchPrompts(prompts, "plan pla");
		expect(match.ranges).toEqual([
			[0, 4],
			[9, 13],
		]);
	});

	test("falls back to the first line with no ranges when only a subsequence matched", () => {
		const prompts = history("remove taslkplane\ntrailing line");
		const [match] = searchPrompts(prompts, "taskplane");
		expect(match.line).toBe("remove taslkplane");
		expect(match.ranges).toEqual([]);
	});
});
