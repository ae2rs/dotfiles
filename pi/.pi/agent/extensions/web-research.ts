/**
 * web_research: answers a question from the live web by delegating to a
 * sandboxed `codex exec` subagent that carries OpenAI's hosted web_search tool.
 * Returns the subagent's prose answer with inline citations — a delegated
 * research run, not a search API.
 *
 * Shelling out to the Codex CLI is deliberate: it already owns OAuth refresh,
 * the ChatGPT backend endpoint, its bespoke headers, and the web_search wiring.
 * Pi's own model API cannot reach this tool — `OpenAICodexResponsesOptions`
 * exposes only reasoning/verbosity/toolChoice, with no server-side tool
 * passthrough — and a raw request would mean reimplementing that transport.
 */
import { existsSync, mkdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { type ResearchRun, parseRun } from "./web-research/events.ts";

/** Cheapest Codex model (~10x under terra) and fast enough for interactive use. */
const MODEL = "gpt-5.6-luna";

/**
 * `none` is the floor for this model — `minimal` is rejected with a 400 — and
 * measured 2-3x cheaper in subagent input tokens than `low` on complex
 * questions, with answers of the same length and quality. Raise to `low` only
 * if answers start coming back thin.
 */
const REASONING_EFFORT = "none";

/** Runs occasionally hang with no output; observed once in five. */
const TIMEOUT_MS = 180_000;

/** Generous headroom over the ~3.6k of the longest answer measured. */
const MAX_ANSWER_CHARS = 12_000;

/** Enough on its own to force a search, even for questions that never mention one. */
const PREAMBLE =
	"Answer the question using web search. Do not inspect local files. Cite source URLs inline.";

const AUTH_PATH = join(homedir(), ".codex", "auth.json");

/** Empty, reused: the subagent gets a working root with nothing in it to read. */
const SCRATCH_DIR = join(tmpdir(), "pi-web-research");

function truncate(answer: string): string {
	if (answer.length <= MAX_ANSWER_CHARS) return answer;
	return `${answer.slice(0, MAX_ANSWER_CHARS)}\n\n[truncated at ${MAX_ANSWER_CHARS} characters]`;
}

/** Every failure still reports whatever the run managed to do before it broke. */
function failed(text: string, run: ResearchRun) {
	return { content: [{ type: "text" as const, text }], details: run, isError: true };
}

export default async function (pi: ExtensionAPI) {
	if (!existsSync(AUTH_PATH)) {
		console.warn("[web-research] no ~/.codex/auth.json — extension disabled");
		return;
	}
	const version = await pi.exec("codex", ["--version"], { timeout: 5_000 });
	if (version.code !== 0) {
		console.warn("[web-research] codex binary not found in PATH — extension disabled");
		return;
	}
	mkdirSync(SCRATCH_DIR, { recursive: true });

	pi.registerTool({
		name: "web_research",
		label: "Web Research",
		description:
			"Answer a question from the live web. Delegates to a search agent that runs its own queries, opens pages, and returns a prose answer with inline source URLs. Ask a complete question rather than keywords; there is no result list to page through. Takes 10-40 seconds.",
		promptSnippet: "answer a question from the live web, with citations",
		promptGuidelines: [
			"Use web_research for anything depending on current facts, or on documentation and releases past your knowledge cutoff. Ask one complete question per call and cite what it returns.",
		],
		parameters: Type.Object({
			question: Type.String({
				description:
					"A complete natural-language question, with any constraints that matter (versions, dates, which comparison you want). Not search keywords.",
			}),
		}),
		async execute(_id, params, signal, onUpdate) {
			onUpdate?.({ content: [{ type: "text", text: "Researching…" }] });

			// No `-c tools.web_search=true`: the hosted tool is always on for this
			// account, and passing `false` does not turn it off. The flag is inert.
			const result = await pi.exec(
				"codex",
				[
					"exec",
					"--ephemeral",
					"--ignore-user-config",
					"--ignore-rules",
					"--skip-git-repo-check",
					"--sandbox",
					"read-only",
					"--color",
					"never",
					"--json",
					// `-C` is the subagent's workspace root; `cwd` below is the process
					// working directory. Both are pinned away from the user's project.
					"-C",
					SCRATCH_DIR,
					"-m",
					MODEL,
					"-c",
					`model_reasoning_effort="${REASONING_EFFORT}"`,
					`${PREAMBLE}\n\n${params.question}`,
				],
				{ signal, timeout: TIMEOUT_MS, cwd: SCRATCH_DIR },
			);

			const run = parseRun(result.stdout);

			if (result.killed) {
				const reason = signal?.aborted ? "cancelled" : `timed out after ${TIMEOUT_MS / 1000}s`;
				return failed(`web_research ${reason}.`, run);
			}
			if (result.code !== 0) {
				const detail = (result.stderr.trim() || result.stdout.trim()).slice(-1_000);
				return failed(`codex exec failed (exit ${result.code}):\n${detail}`, run);
			}
			if (!run.answer) {
				return failed(
					"codex exec returned no answer. Its --json event names may have changed; check `codex exec --json` output directly.",
					run,
				);
			}

			// Searches and usage stay in details: useful for the UI and logs, but the
			// model only needs the answer, and this tool exists to spend few tokens.
			return { content: [{ type: "text", text: truncate(run.answer) }], details: run };
		},
	});
}
