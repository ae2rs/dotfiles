/**
 * Fuzzy `@path` completion, ranked by fzf.
 *
 * Pi's built-in provider turns an `@` token into an fd regex: it scopes to the
 * directory before the last `/` and then matches each segment as a literal
 * substring. So `@nvim/keym` works but `@nvmkeym` or `@nvim/cfg/keym` does not.
 * This wraps the provider and ranks candidates through `fzf --filter` instead —
 * Ctrl+T's scoring over the same files and directories the built-in walks.
 *
 * fzf has to be fed over a pipe: its own walker and $FZF_DEFAULT_COMMAND only
 * engage when stdin is a TTY, and handing a child /dev/tty would make it race
 * Pi's editor for keystrokes. The list therefore comes from LIST_COMMAND rather
 * than from the shell's own fzf vars, which are files-only and shared with
 * Ctrl+T.
 *
 * Everything else (slash commands, bare `@`, unquoted path tokens, and any case
 * where fzf is missing or matches nothing) falls through to the wrapped
 * provider, including `applyCompletion`.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type {
	AutocompleteItem,
	AutocompleteProvider,
	AutocompleteSuggestions,
} from "@earendil-works/pi-tui";
import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, delimiter, join } from "node:path";

/** How many suggestions to surface. Matches the built-in provider's cap. */
const MAX_ITEMS = 20;
/** Keystrokes arrive faster than the list command can rewalk a large tree. */
const CACHE_TTL_MS = 4000;
/** Candidates to rank. Same walk Pi's built-in provider does, directories included. */
const LIST_COMMAND = "fd --type f --type d --follow --hidden --exclude .git";

const PATH_DELIMITERS = new Set([" ", "\t", '"', "'", "="]);

const candidateCache = new Map<string, { paths: string[]; at: number }>();

function which(name: string): string | null {
	for (const dir of (process.env.PATH ?? "").split(delimiter)) {
		if (!dir) continue;
		const candidate = join(dir, name);
		if (existsSync(candidate)) return candidate;
	}
	return null;
}

function isDirectory(path: string): boolean {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}

function isTokenStart(text: string, index: number): boolean {
	return index === 0 || PATH_DELIMITERS.has(text[index - 1] ?? "");
}

/** Index of the opening quote of an unterminated `"`, if any. */
function findUnclosedQuoteStart(text: string): number | null {
	let inQuotes = false;
	let quoteStart = -1;
	for (let i = 0; i < text.length; i += 1) {
		if (text[i] !== '"') continue;
		inQuotes = !inQuotes;
		if (inQuotes) quoteStart = i;
	}
	return inQuotes ? quoteStart : null;
}

type AtToken = { token: string; rawQuery: string; isQuoted: boolean };

function extractAtToken(text: string): AtToken | null {
	const quoteStart = findUnclosedQuoteStart(text);
	if (quoteStart !== null) {
		// Only an `@"…` token is ours; a bare `"…` stays with the built-in.
		if (quoteStart === 0 || text[quoteStart - 1] !== "@") return null;
		if (!isTokenStart(text, quoteStart - 1)) return null;
		return {
			token: text.slice(quoteStart - 1),
			rawQuery: text.slice(quoteStart + 1),
			isQuoted: true,
		};
	}

	let start = text.length;
	while (start > 0 && !PATH_DELIMITERS.has(text[start - 1] ?? "")) start -= 1;
	if (text[start] !== "@") return null;
	return { token: text.slice(start), rawQuery: text.slice(start + 1), isQuoted: false };
}

type SearchScope = { root: string; query: string; displayBase: string };

/**
 * Where to walk, and what to hand fzf.
 *
 * Relative tokens fuzzy-match the whole path below the session cwd, so
 * `@nvmkeym` reaches `nvim/lua/config/keymaps.lua`. Home and absolute tokens
 * keep the built-in's scoping — anchored at the last real directory — rather
 * than walking all of $HOME on every keystroke.
 */
function resolveScope(rawQuery: string, cwd: string): SearchScope | null {
	const normalized = rawQuery.replace(/\\/g, "/");
	if (!normalized.startsWith("~/") && !normalized.startsWith("/")) {
		return { root: cwd, query: normalized, displayBase: "" };
	}

	const slash = normalized.lastIndexOf("/");
	if (slash === -1) return null;
	const displayBase = normalized.slice(0, slash + 1);
	const root = displayBase.startsWith("~/") ? join(homedir(), displayBase.slice(2)) : displayBase;
	if (!isDirectory(root)) return null;
	return { root, query: normalized.slice(slash + 1), displayBase };
}

function runCapture(
	bin: string,
	args: string[],
	cwd: string,
	signal: AbortSignal,
	stdin?: string,
): Promise<string[] | null> {
	return new Promise((resolve) => {
		if (signal.aborted) {
			resolve(null);
			return;
		}

		const child = spawn(bin, args, {
			cwd,
			stdio: [stdin === undefined ? "ignore" : "pipe", "pipe", "ignore"],
		});
		let stdout = "";
		let settled = false;

		const finish = (result: string[] | null) => {
			if (settled) return;
			settled = true;
			signal.removeEventListener("abort", onAbort);
			resolve(result);
		};
		const onAbort = () => {
			if (child.exitCode === null) child.kill("SIGKILL");
			finish(null);
		};
		signal.addEventListener("abort", onAbort, { once: true });

		child.stdout?.setEncoding("utf-8");
		child.stdout?.on("data", (chunk: string) => {
			stdout += chunk;
		});
		child.on("error", () => finish(null));
		// fzf exits 1 with no matches; treat that as empty, not as a failure.
		child.on("close", (code) => {
			if (signal.aborted || (code !== 0 && code !== 1)) {
				finish(null);
				return;
			}
			finish(stdout ? stdout.split("\n").filter(Boolean) : []);
		});

		if (stdin !== undefined && child.stdin) {
			child.stdin.on("error", () => {});
			child.stdin.end(stdin);
		}
	});
}

async function listCandidates(
	listCommand: string,
	root: string,
	signal: AbortSignal,
): Promise<string[] | null> {
	const cached = candidateCache.get(root);
	if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.paths;

	const shell = process.env.SHELL || "/bin/sh";
	const paths = await runCapture(shell, ["-c", listCommand], root, signal);
	if (paths === null) return null;
	candidateCache.set(root, { paths, at: Date.now() });
	return paths;
}

/** The path as it should appear in the editor. Keeps fd's trailing slash on directories. */
function completionPathFor(line: string, scope: SearchScope): string {
	const relativePath = line.replace(/^\.\//, "");
	return scope.displayBase === "/" ? `/${relativePath}` : `${scope.displayBase}${relativePath}`;
}

function buildItem(line: string, scope: SearchScope, isQuoted: boolean): AutocompleteItem {
	const completionPath = completionPathFor(line, scope);
	const isDir = completionPath.endsWith("/");
	const displayPath = isDir ? completionPath.slice(0, -1) : completionPath;
	const value =
		isQuoted || completionPath.includes(" ") ? `@"${completionPath}"` : `@${completionPath}`;

	return {
		value,
		label: basename(displayPath) + (isDir ? "/" : ""),
		description: displayPath,
	};
}

function createProvider(
	current: AutocompleteProvider,
	getCwd: () => string,
	fzfPath: string,
	listCommand: string,
): AutocompleteProvider {
	return {
		triggerCharacters: current.triggerCharacters,

		async getSuggestions(
			lines: string[],
			cursorLine: number,
			cursorCol: number,
			options: { signal: AbortSignal; force?: boolean },
		): Promise<AutocompleteSuggestions | null> {
			const delegate = () => current.getSuggestions(lines, cursorLine, cursorCol, options);
			const textBeforeCursor = (lines[cursorLine] ?? "").slice(0, cursorCol);

			const at = extractAtToken(textBeforeCursor);
			// A bare `@` has nothing to rank; the built-in's base-directory
			// listing is the better answer there.
			if (!at || !at.rawQuery) return delegate();

			const scope = resolveScope(at.rawQuery, getCwd());
			if (!scope || !scope.query) return delegate();

			const candidates = await listCandidates(listCommand, scope.root, options.signal);
			if (!candidates?.length) return delegate();

			const ranked = await runCapture(
				fzfPath,
				["--filter", scope.query, "--scheme=path"],
				scope.root,
				options.signal,
				`${candidates.join("\n")}\n`,
			);
			if (!ranked?.length) return delegate();

			// A directory matches its own name, so after accepting one it would come
			// back as the top hit and the next Tab would stall instead of drilling in.
			const typed = at.rawQuery.replace(/\\/g, "/");
			const items = ranked
				.filter((line) => completionPathFor(line, scope) !== typed)
				.slice(0, MAX_ITEMS)
				.map((line) => buildItem(line, scope, at.isQuoted));
			if (items.length === 0) return delegate();

			return { items, prefix: at.token };
		},

		applyCompletion: (lines, cursorLine, cursorCol, item, prefix) =>
			current.applyCompletion(lines, cursorLine, cursorCol, item, prefix),

		shouldTriggerFileCompletion: (lines, cursorLine, cursorCol) =>
			current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true,
	};
}

export default function (pi: ExtensionAPI): void {
	let cwd = process.cwd();

	pi.on("session_start", (_event, ctx) => {
		cwd = ctx.cwd;
		if (ctx.mode !== "tui") return;

		const fzfPath = which("fzf");
		if (!fzfPath) return;

		candidateCache.clear();
		ctx.ui.addAutocompleteProvider((current) =>
			createProvider(current, () => cwd, fzfPath, LIST_COMMAND),
		);
	});
}
