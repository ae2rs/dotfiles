import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dedupePrompts, parseSessionPrompts, PromptHistoryCache } from "../prompt-history/data.ts";

const temporaryDirectories: string[] = [];

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { force: true, recursive: true });
});

function fixture(content: string): { root: string; file: string } {
	const root = mkdtempSync(join(tmpdir(), "pi-prompt-history-"));
	temporaryDirectories.push(root);
	const directory = join(root, "--project--");
	mkdirSync(directory);
	const file = join(directory, "session.jsonl");
	writeFileSync(file, content);
	return { root, file };
}

function session(lines: unknown[]): string {
	return `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`;
}

describe("prompt history", () => {
	test("extracts text user prompts and skips other content", () => {
		const { file } = fixture("");
		const content = session([
			{ type: "session", cwd: "/work/project" },
			{ type: "message", timestamp: "2026-01-01T00:00:00.000Z", message: { role: "user", content: "string prompt" } },
			{
				type: "message",
				message: { role: "user", timestamp: 20, content: [{ type: "text", text: "first" }, { type: "image" }, { type: "text", text: "second" }] },
			},
			{ type: "message", message: { role: "user", content: [{ type: "image" }] } },
			{ type: "message", message: { role: "assistant", content: [{ type: "text", text: "not a prompt" }] } },
		]) + "malformed JSON\n";
		expect(parseSessionPrompts(content, file)).toMatchObject([
			{ text: "string prompt", cwd: "/work/project" },
			{ text: "first\nsecond", timestamp: 20, cwd: "/work/project" },
		]);
	});

	test("deduplicates exact prompts by most recent occurrence", () => {
		const prompts = dedupePrompts([
			{ text: "repeat", timestamp: 10, cwd: "/old", sessionFile: "/old.jsonl", count: 1 },
			{ text: "other", timestamp: 15, cwd: "/other", sessionFile: "/other.jsonl", count: 1 },
			{ text: "repeat", timestamp: 20, cwd: "/new", sessionFile: "/new.jsonl", count: 1 },
		]);

		expect(prompts).toEqual([
			{ text: "repeat", timestamp: 20, cwd: "/new", sessionFile: "/new.jsonl", count: 2 },
			{ text: "other", timestamp: 15, cwd: "/other", sessionFile: "/other.jsonl", count: 1 },
		]);
	});


	test("refreshes only when a session file changes", async () => {
		const initial = session([
			{ type: "session", cwd: "/work/project" },
			{ type: "message", message: { role: "user", content: "first prompt", timestamp: 1 } },
		]);
		const { root, file } = fixture(initial);
		const cache = new PromptHistoryCache();
		expect((await cache.load(root)).map((prompt) => prompt.text)).toEqual(["first prompt"]);

		await Bun.sleep(20);
		writeFileSync(
			file,
			session([
				{ type: "session", cwd: "/work/project" },
				{ type: "message", message: { role: "user", content: "first prompt", timestamp: 1 } },
				{ type: "message", message: { role: "user", content: "second prompt", timestamp: 2 } },
			]),
		);
		expect((await cache.load(root)).map((prompt) => prompt.text)).toEqual(["second prompt", "first prompt"]);
	});
});
