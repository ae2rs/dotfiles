/** Standalone smoke test: node pi/.pi/agent/extensions/tests/memory-store-smoke.ts */
import assert from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { MemoryStore } from "../memory/store.ts";

const store = new MemoryStore(":memory:");

const a = store.save({
	title: "Use pnpm in the monorepo",
	content: "Use pnpm, never npm, in the monorepo",
	type: "convention",
	tags: ["Monorepo", "package-manager"],
});
const b = store.save({
	title: "Git branch prefix",
	content: "Git branches must start with the ae2rs/ prefix",
	type: "convention",
	tags: ["git"],
	scope: "dotfiles",
	relatedIds: [a.id],
});
const c = store.save({
	title: "Edit tool array quirk",
	content: "The edit tool rejects JSON-encoded edits arrays",
	type: "tool-quirk",
});

assert.equal(store.census().count, 3);
assert.deepEqual(store.census().types, ["convention", "tool-quirk"]);
assert.deepEqual(a.tags, ["monorepo", "package-manager"], "tags normalized to lowercase");
assert.deepEqual(store.get(a.id)?.relatedIds, [b.id], "relations are visible from either end");
assert.deepEqual(b.relatedIds, [a.id]);
assert.deepEqual(store.tagCounts(), [
	{ tag: "git", count: 1 },
	{ tag: "monorepo", count: 1 },
	{ tag: "package-manager", count: 1 },
]);

// Full-text search ranks content and title matches.
assert.deepEqual(
	store.search({ query: "pnpm" }).map((entry) => entry.id),
	[a.id],
);
assert.deepEqual(
	store.search({ query: "branch" }).map((entry) => entry.id),
	[b.id],
);

// Scope filter: "dotfiles" sees global + dotfiles, not other projects.
assert.equal(store.search({ scope: "dotfiles" }).length, 3);
const otherScoped = store.search({ scope: "monorepo" });
assert.equal(otherScoped.length, 2, "global + a/c only — b is scoped to dotfiles");
assert.equal(store.search({ scope: "all" }).length, 3);

// Tag filter requires ALL tags.
assert.equal(store.search({ tags: ["monorepo", "package-manager"] }).length, 1);
assert.equal(store.search({ tags: ["monorepo", "git"] }).length, 0);

// Type filter + FTS query combined.
assert.equal(store.search({ query: "prefix", type: "convention" }).length, 1);
assert.equal(store.search({ query: "prefix", type: "fact" }).length, 0);

// Update: title/content re-indexed; tags and relationships are replaced.
const updated = store.update(a.id, {
	title: "Always use pnpm",
	content: "Always use pnpm in the monorepo",
	tags: ["pkg"],
	relatedIds: [],
});
assert.equal(updated?.type, "convention");
assert.equal(updated?.title, "Always use pnpm");
assert.deepEqual(updated?.tags, ["pkg"]);
assert.deepEqual(store.get(b.id)?.relatedIds, []);
assert.equal(store.search({ query: "never npm" }).length, 0, "old content gone from FTS");
assert.equal(store.search({ query: "Always use" }).length, 1);
assert.equal(store.search({ tags: ["monorepo"] }).length, 0, "old tags replaced");
assert.deepEqual(store.tagCounts(), [
	{ tag: "git", count: 1 },
	{ tag: "pkg", count: 1 },
]);
assert.ok(updated!.updated >= a.updated);

assert.throws(() => store.save({ title: "Broken link", content: "x", relatedIds: ["missing"] }));
assert.equal(store.update("nope", { content: "x" }), undefined);

// Delete removes from every index and all linked records.
assert.equal(store.delete(c.id), true);
assert.equal(store.search({ query: "edit tool" }).length, 0);
assert.equal(store.census().count, 2);
assert.equal(store.delete(c.id), false);

// FTS metacharacters in queries don't throw.
assert.doesNotThrow(() => store.search({ query: 'pnpm OR "unclosed' }));

store.close();

// Existing databases are upgraded with generated titles and a rebuilt FTS index.
const directory = mkdtempSync(join(tmpdir(), "pi-memory-store-"));
const databasePath = join(directory, "memories.db");
const legacy = new DatabaseSync(databasePath);
legacy.exec(`
	CREATE TABLE memories (
		id TEXT PRIMARY KEY,
		content TEXT NOT NULL,
		type TEXT NOT NULL DEFAULT 'fact',
		scope TEXT NOT NULL DEFAULT 'global',
		created TEXT NOT NULL,
		updated TEXT NOT NULL
	);
	CREATE TABLE memory_tags (
		memory_id TEXT NOT NULL,
		tag TEXT NOT NULL,
		PRIMARY KEY (memory_id, tag)
	);
	CREATE VIRTUAL TABLE memories_fts USING fts5(id UNINDEXED, content);
`);
legacy
	.prepare("INSERT INTO memories VALUES (?, ?, ?, ?, ?, ?)")
	.run("legacy", "Legacy memory content", "fact", "global", "now", "now");
legacy.prepare("INSERT INTO memories_fts VALUES (?, ?)").run("legacy", "Legacy memory content");
legacy.close();

const migrated = new MemoryStore(databasePath);
assert.equal(migrated.get("legacy")?.title, "Legacy memory content");
assert.deepEqual(
	migrated.search({ query: "legacy" }).map((entry) => entry.id),
	["legacy"],
);
migrated.close();
rmSync(directory, { recursive: true, force: true });

console.log("memory-store smoke test: all assertions passed");
