/**
 * Ranking for prompt reverse search.
 *
 * Subsequence matching alone is far too permissive over prompt bodies that run
 * to thousands of characters: a short query matches somewhere in almost every
 * prompt, and the resulting order looks arbitrary. So matches are bucketed into
 * tiers — exact phrase, then every term present literally, then subsequence —
 * and a tier always beats the ones below it regardless of score. The
 * subsequence tier exists only to survive typos, so it sees a bounded prefix
 * and is scored by how nearly contiguous the match was.
 */

import type { Prompt } from "./data.ts";

/** Past this, a subsequence hit says more about a prompt's length than its content. */
const SUBSEQUENCE_TEXT_LIMIT = 2000;
const WORD_BOUNDARY_BONUS = 20;
const WORD_BOUNDARY = /[\s\-_./:]/;

/** Compared before scores, so the per-tier score scales never have to agree. */
const Tier = { phrase: 0, terms: 1, subsequence: 2 } as const;

export type PromptMatch = {
	prompt: Prompt;
	/** The line worth showing: the one covering the most query terms. */
	line: string;
	/** Half-open `[start, end)` offsets into `line` that the query matched. */
	ranges: Array<[number, number]>;
};

type Ranking = {
	tier: number;
	/** Lower is better. Only meaningful against rankings in the same tier. */
	score: number;
	/** Literal strings to highlight; empty when the match was only a subsequence. */
	needles: string[];
};

/** Earlier hits win, and a hit starting a word beats one buried inside one. */
function literalScore(lowerText: string, index: number): number {
	const startsWord = index === 0 || WORD_BOUNDARY.test(lowerText[index - 1]);
	return index - (startsWord ? WORD_BOUNDARY_BONUS : 0);
}

/**
 * Width of the tightest subsequence match ending as early as possible, or
 * `undefined` if `needle` is not a subsequence of `text`. A span near the
 * needle's own length means the characters were nearly adjacent, so a typo
 * scores far better than a match scattered across a whole paragraph.
 */
function subsequenceSpan(text: string, needle: string): number | undefined {
	let cursor = 0;
	let end = 0;
	for (let index = 0; index < text.length && cursor < needle.length; index += 1) {
		if (text[index] !== needle[cursor]) continue;
		cursor += 1;
		end = index;
	}
	if (cursor < needle.length) return undefined;

	// A forward scan alone would keep a stray early character, inflating the span
	// even when the rest of the needle matched contiguously much later. Walking
	// back from `end` yields the tightest window that ends there; the forward
	// scan already proved one exists, so `back` is guaranteed to run out.
	let start = end;
	let back = needle.length - 1;
	for (let index = end; index >= 0 && back >= 0; index -= 1) {
		if (text[index] !== needle[back]) continue;
		start = index;
		back -= 1;
	}
	return end - start + 1;
}

function rankPrompt(text: string, phrase: string, terms: string[]): Ranking | undefined {
	const lower = text.toLowerCase();

	const phraseIndex = lower.indexOf(phrase);
	if (phraseIndex !== -1) {
		return { tier: Tier.phrase, score: literalScore(lower, phraseIndex), needles: [phrase] };
	}

	let literalTotal = 0;
	let allLiteral = true;
	for (const term of terms) {
		const index = lower.indexOf(term);
		if (index === -1) {
			allLiteral = false;
			break;
		}
		literalTotal += literalScore(lower, index);
	}
	if (allLiteral) return { tier: Tier.terms, score: literalTotal, needles: terms };

	const bounded = lower.slice(0, SUBSEQUENCE_TEXT_LIMIT);
	let spanTotal = 0;
	for (const term of terms) {
		const span = subsequenceSpan(bounded, term);
		if (span === undefined) return undefined;
		spanTotal += span;
	}
	return { tier: Tier.subsequence, score: spanTotal, needles: [] };
}

function mergeRanges(ranges: Array<[number, number]>): Array<[number, number]> {
	const merged: Array<[number, number]> = [];
	for (const [start, end] of [...ranges].sort((a, b) => a[0] - b[0])) {
		const last = merged.at(-1);
		if (last && start <= last[1]) last[1] = Math.max(last[1], end);
		else merged.push([start, end]);
	}
	return merged;
}

function firstLine(text: string): string {
	const end = text.indexOf("\n");
	return end === -1 ? text : text.slice(0, end);
}

/** Show the line covering the most needles, so a row can explain its own rank. */
function locateLine(text: string, needles: string[]): Pick<PromptMatch, "line" | "ranges"> {
	if (needles.length === 0) return { line: firstLine(text), ranges: [] };

	let best = { line: "", ranges: [] as Array<[number, number]>, covered: -1 };
	for (const line of text.split("\n")) {
		const lower = line.toLowerCase();
		const ranges: Array<[number, number]> = [];
		let covered = 0;
		for (const needle of needles) {
			const before = ranges.length;
			for (let at = lower.indexOf(needle); at !== -1; at = lower.indexOf(needle, at + needle.length)) {
				ranges.push([at, at + needle.length]);
			}
			if (ranges.length > before) covered += 1;
		}
		if (covered > best.covered) best = { line, ranges: mergeRanges(ranges), covered };
		if (covered === needles.length) break;
	}
	return { line: best.line, ranges: best.ranges };
}

/**
 * Rank `prompts` against `query`, best first. Expects `prompts` newest first:
 * the sort is stable, so recency breaks ties that tier, score and reuse leave.
 */
export function searchPrompts(prompts: Prompt[], query: string): PromptMatch[] {
	const phrase = query.trim().toLowerCase();
	const terms = phrase.split(/[\s/]+/).filter((term) => term.length > 0);
	if (terms.length === 0) {
		return prompts.map((prompt) => ({ prompt, ...locateLine(prompt.text, []) }));
	}

	const ranked: Array<{ match: PromptMatch; ranking: Ranking }> = [];
	for (const prompt of prompts) {
		const ranking = rankPrompt(prompt.text, phrase, terms);
		if (!ranking) continue;
		ranked.push({ match: { prompt, ...locateLine(prompt.text, ranking.needles) }, ranking });
	}
	ranked.sort(
		(a, b) =>
			a.ranking.tier - b.ranking.tier ||
			a.ranking.score - b.ranking.score ||
			b.match.prompt.count - a.match.prompt.count,
	);
	return ranked.map((entry) => entry.match);
}
