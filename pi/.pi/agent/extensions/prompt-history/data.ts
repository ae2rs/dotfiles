import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

export type Prompt = {
	text: string;
	timestamp: number;
	cwd: string;
	sessionFile: string;
	count: number;
};

type TextBlock = { type: "text"; text: string };

type CachedSession = {
	mtimeMs: number;
	prompts: Prompt[];
};

type SessionEntry = {
	type?: string;
	timestamp?: string;
	cwd?: string;
	message?: {
		role?: string;
		content?: unknown;
		timestamp?: number;
	};
};

function textContent(content: unknown): string | undefined {
	if (typeof content === "string") return content.trim() || undefined;
	if (!Array.isArray(content)) return undefined;
	const text = content
		.filter((block): block is TextBlock =>
			typeof block === "object" &&
			block !== null &&
			(block as { type?: unknown }).type === "text" &&
			typeof (block as { text?: unknown }).text === "string",
		)
		.map((block) => block.text)
		.join("\n")
		.trim();
	return text || undefined;
}

function entryTimestamp(entry: SessionEntry): number {
	if (Number.isFinite(entry.message?.timestamp)) return entry.message?.timestamp as number;
	const parsed = entry.timestamp ? Date.parse(entry.timestamp) : NaN;
	return Number.isFinite(parsed) ? parsed : 0;
}

/** Extract the searchable user prompts from one session JSONL file. */
export function parseSessionPrompts(content: string, sessionFile: string): Prompt[] {
	let cwd = "";
	const prompts: Prompt[] = [];

	for (const line of content.split("\n")) {
		if (!line.trim()) continue;
		let entry: SessionEntry;
		try {
			entry = JSON.parse(line) as SessionEntry;
		} catch {
			continue;
		}

		if (entry.type === "session" && typeof entry.cwd === "string") {
			cwd = entry.cwd;
			continue;
		}
		if (entry.type !== "message" || entry.message?.role !== "user") continue;
		const text = textContent(entry.message.content);
		if (!text) continue;
		prompts.push({ text, timestamp: entryTimestamp(entry), cwd, sessionFile, count: 1 });
	}

	return prompts;
}

/** Keep the newest copy of each exact prompt and record its total reuse count. */
export function dedupePrompts(prompts: Prompt[]): Prompt[] {
	const byText = new Map<string, Prompt>();
	for (const prompt of prompts) {
		const existing = byText.get(prompt.text);
		if (!existing) {
			byText.set(prompt.text, { ...prompt });
			continue;
		}
		existing.count += 1;
		if (prompt.timestamp > existing.timestamp) {
			byText.set(prompt.text, { ...prompt, count: existing.count });
		}
	}
	return [...byText.values()].sort((a, b) => b.timestamp - a.timestamp);
}

async function sessionFiles(sessionsRoot: string): Promise<string[]> {
	let projectDirectories;
	try {
		projectDirectories = await readdir(sessionsRoot, { withFileTypes: true });
	} catch {
		return [];
	}

	const files: string[] = [];
	for (const projectDirectory of projectDirectories) {
		if (!projectDirectory.isDirectory()) continue;
		try {
			const entries = await readdir(join(sessionsRoot, projectDirectory.name), { withFileTypes: true });
			for (const entry of entries) {
				if (entry.isFile() && entry.name.endsWith(".jsonl")) {
					files.push(join(sessionsRoot, projectDirectory.name, entry.name));
				}
			}
		} catch {
			// A concurrent session cleanup should not stop search across other projects.
		}
	}
	return files;
}

export class PromptHistoryCache {
	private readonly sessions = new Map<string, CachedSession>();

	async load(sessionsRoot: string): Promise<Prompt[]> {
		const files = await sessionFiles(sessionsRoot);
		const present = new Set(files);
		for (const file of files) {
			let fileStat;
			try {
				fileStat = await stat(file);
			} catch {
				continue;
			}
			const cached = this.sessions.get(file);
			if (cached?.mtimeMs === fileStat.mtimeMs) continue;
			try {
				const content = await readFile(file, "utf8");
				this.sessions.set(file, { mtimeMs: fileStat.mtimeMs, prompts: parseSessionPrompts(content, file) });
			} catch {
				this.sessions.delete(file);
			}
		}
		for (const file of this.sessions.keys()) {
			if (!present.has(file)) this.sessions.delete(file);
		}
		return dedupePrompts([...this.sessions.values()].flatMap((session) => session.prompts));
	}
}
