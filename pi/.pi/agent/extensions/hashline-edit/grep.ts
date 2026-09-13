/**
 * `grep`, backed by in-process ripgrep and grouped per file.
 *
 * Two changes over the built-in, both aimed at what the model does next. Results
 * are grouped under a `[path#TAG]` header rather than repeating `path:line:` on
 * every row, so a hit can be edited straight away without a confirming `read`.
 * And matches are capped per file rather than globally, so one hot file cannot
 * consume the whole budget before other files are reached.
 */
import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { DEFAULT_MAX_BYTES, formatSize, truncateHead, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { Filesystem } from "@oh-my-pi/hashline";
import { grep, GrepOutputMode, type GrepMatch } from "@oh-my-pi/pi-natives";
import { Type, type Static } from "typebox";
import type { EditSessionState } from "./state.ts";

/** Files shown per page. `skip` pages past them. */
const FILE_LIMIT = 20;
/** Matches shown per file, so a hot file cannot crowd out the rest of the page. */
const MULTI_FILE_MATCHES = 20;
const SINGLE_FILE_MATCHES = 200;
/** Native ceiling before per-file capping, and the per-line character cap. */
const TOTAL_CAP = 2000;
const MAX_COLUMNS = 512;
const TIMEOUT_MS = 30_000;

const grepSchema = Type.Object({
	pattern: Type.String({ description: "Search pattern (regex or literal string)" }),
	path: Type.Optional(Type.String({ description: "Directory or file to search (default: current directory)" })),
	glob: Type.Optional(Type.String({ description: "Filter files by glob pattern, e.g. '*.ts' or '**/*.spec.ts'" })),
	ignoreCase: Type.Optional(Type.Boolean({ description: "Case-insensitive search (default: false)" })),
	literal: Type.Optional(Type.Boolean({ description: "Treat pattern as literal string instead of regex (default: false)" })),
	contextBefore: Type.Optional(Type.Number({ description: "Context lines before each match (default: 1)" })),
	contextAfter: Type.Optional(Type.Number({ description: "Context lines after each match (default: 3)" })),
	skip: Type.Optional(Type.Number({ description: "Number of files to skip, for paging past a full page of results" })),
});

type GrepParams = Static<typeof grepSchema>;

/** Rust regex has no literal mode, so escape the pattern instead. */
function escapeRegex(pattern: string): string {
	return pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface FileHits {
	path: string;
	matches: GrepMatch[];
}

function groupByFile(matches: GrepMatch[]): FileHits[] {
	const groups = new Map<string, GrepMatch[]>();
	for (const match of matches) {
		const hits = groups.get(match.path);
		if (hits) hits.push(match);
		else groups.set(match.path, [match]);
	}
	return [...groups].map(([path, hits]) => ({ path, matches: hits }));
}

/**
 * Rows for one file: `*N:` marks a match, ` N:` its context. Context lines are
 * merged into the same numbered space as matches and de-duplicated, so
 * overlapping context windows do not print a line twice.
 */
function renderRows(matches: GrepMatch[]): { rows: string[]; lines: number[] } {
	const byLine = new Map<number, { text: string; isMatch: boolean }>();
	for (const match of matches) {
		for (const context of match.contextBefore ?? []) {
			if (!byLine.has(context.lineNumber)) byLine.set(context.lineNumber, { text: context.line, isMatch: false });
		}
		for (const context of match.contextAfter ?? []) {
			if (!byLine.has(context.lineNumber)) byLine.set(context.lineNumber, { text: context.line, isMatch: false });
		}
		byLine.set(match.lineNumber, { text: match.line, isMatch: true });
	}

	const lines = [...byLine.keys()].sort((a, b) => a - b);
	const rows: string[] = [];
	let previous: number | undefined;
	for (const line of lines) {
		// A gap means the next run is discontiguous; mark it so the model does not
		// read the rows as consecutive source.
		if (previous !== undefined && line > previous + 1) rows.push("…");
		const entry = byLine.get(line);
		if (entry) rows.push(`${entry.isMatch ? "*" : " "}${line}:${entry.text}`);
		previous = line;
	}
	return { rows, lines };
}

export function createGroupedGrepTool(
	cwd: string,
	fs: Filesystem,
	state: EditSessionState,
): ToolDefinition<typeof grepSchema, undefined> {
	return {
		name: "grep",
		label: "grep",
		description: `Search file contents for a pattern. Respects .gitignore. Results are grouped under a \`[path#TAG]\` header; \`*N:\` marks a matching line and \` N:\` surrounding context, and \`…\` marks a gap between non-adjacent runs. The header tag can be used directly with \`edit\` — no confirming \`read\` needed. Shows ${FILE_LIMIT} files per page with up to ${MULTI_FILE_MATCHES} matches each; use \`skip\` to page.`,
		parameters: grepSchema,
		async execute(_toolCallId, params: GrepParams, signal) {
			// Compare canonical paths: a search root reached through a symlink (macOS
			// /tmp, a linked worktree) would otherwise look outside the session cwd and
			// force every header to the absolute form.
			const base = await canonical(cwd);
			const root = await canonical(resolve(cwd, params.path ?? "."));
			const singleFile = await stat(root)
				.then((entry) => entry.isFile())
				.catch(() => false);

			const result = await grep({
				pattern: params.literal ? escapeRegex(params.pattern) : params.pattern,
				path: root,
				glob: params.glob,
				ignoreCase: params.ignoreCase ?? false,
				hidden: true,
				gitignore: true,
				contextBefore: params.contextBefore ?? 1,
				contextAfter: params.contextAfter ?? 3,
				maxColumns: MAX_COLUMNS,
				maxCount: TOTAL_CAP,
				maxCountPerFile: singleFile ? SINGLE_FILE_MATCHES : MULTI_FILE_MATCHES,
				mode: GrepOutputMode.Content,
				signal,
				timeoutMs: TIMEOUT_MS,
			});

			const skip = Math.max(0, Math.floor(params.skip ?? 0));
			const grouped = groupByFile(result.matches);
			const page = grouped.slice(skip, skip + FILE_LIMIT);
			if (page.length === 0) {
				return {
					content: [{ type: "text", text: skip > 0 ? `No more results (${grouped.length} files matched)` : "No matches found" }],
					details: undefined,
				};
			}

			const blocks: string[] = [];
			for (const file of page) {
				const absolute = isAbsolute(file.path) ? file.path : resolve(root, file.path);
				const { rows, lines } = renderRows(file.matches);
				blocks.push([`[${await header(absolute, base, lines, fs, state)}]`, ...rows].join("\n"));
			}

			const notices: string[] = [];
			const remaining = grouped.length - (skip + page.length);
			if (remaining > 0) notices.push(`${remaining} more files. Use skip=${skip + page.length} for the next page`);
			if (result.skippedOversized) notices.push(`${result.skippedOversized} files skipped (over size limit)`);

			const truncation = truncateHead(blocks.join("\n\n"), { maxLines: Number.MAX_SAFE_INTEGER });
			if (truncation.truncated) notices.push(`${formatSize(DEFAULT_MAX_BYTES)} limit reached`);

			const text = notices.length > 0 ? `${truncation.content}\n\n[${notices.join(". ")}]` : truncation.content;
			return { content: [{ type: "text", text }], details: undefined };
		},
	};
}

/**
 * `path#TAG` when the file can be snapshotted, bare `path` otherwise. A missing
 * tag is not an error: it just means this hit needs a `read` before it can be
 * edited, which is the same position the built-in grep always left the model in.
 *
 * The displayed path must resolve back to the same file from the session cwd,
 * because that is how `edit` canonicalizes a section header. A cwd-relative path
 * that climbs out of the tree is replaced with the absolute one: equally
 * resolvable, and far easier to read than a stack of `../`.
 */
async function canonical(path: string): Promise<string> {
	return realpath(path).catch(() => path);
}

async function header(
	absolute: string,
	cwd: string,
	lines: number[],
	fs: Filesystem,
	state: EditSessionState,
): Promise<string> {
	const fromCwd = relative(cwd, absolute);
	const display = fromCwd && !fromCwd.startsWith("..") ? fromCwd : absolute;
	try {
		const fullText = await fs.readText(absolute);
		return `${display}#${state.snapshots.record(fs.canonicalPath(absolute), fullText, lines)}`;
	} catch {
		return display;
	}
}
