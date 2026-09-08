/** Standalone smoke test: node pi/.pi/agent/extensions/tests/memory-store-smoke.ts */
import assert from "node:assert";
import { MemoryStore } from "../memory/store.ts";

const store = new MemoryStore(":memory:");

const a = store.save({ content: "Use pnpm, never npm, in the monorepo", type: "convention", tags: ["Monorepo", "package-manager"] });
const b = store.save({ content: "Git branches must start with the ae2rs/ prefix", type: "convention", tags: ["git"], scope: "dotfiles" });
const c = store.save({ content: "The edit tool rejects JSON-encoded edits arrays", type: "tool-quirk" });

assert.equal(store.census().count, 3);
assert.deepEqual(store.census().types, ["convention", "tool-quirk"]);
assert.deepEqual(a.tags, ["monorepo", "package-manager"], "tags normalized to lowercase");

// Full-text search ranks matches
const fts = store.search({ query: "pnpm" });
assert.deepEqual(fts.map((e) => e.id), [a.id]);

// Scope filter: "dotfiles" sees global + dotfiles, not other projects
const scoped = store.search({ scope: "dotfiles" });
assert.equal(scoped.length, 3);
const otherScoped = store.search({ scope: "monorepo" });
assert.equal(otherScoped.length, 2, "global + a/b only — b is scoped to dotfiles");
assert.equal(store.search({ scope: "all" }).length, 3);

// Tag filter requires ALL tags
assert.equal(store.search({ tags: ["monorepo", "package-manager"] }).length, 1);
assert.equal(store.search({ tags: ["monorepo", "git"] }).length, 0);

// Type filter + FTS query combined
assert.equal(store.search({ query: "prefix", type: "convention" }).length, 1);
assert.equal(store.search({ query: "prefix", type: "fact" }).length, 0);

// Update: content re-indexed, tags replaced, updated timestamp bumped
const updated = store.update(a.id, { content: "Always use pnpm in the monorepo", tags: ["pkg"] });
assert.equal(updated?.type, "convention");
assert.deepEqual(updated?.tags, ["pkg"]);
assert.equal(store.search({ query: "never npm" }).length, 0, "old content gone from FTS");
assert.equal(store.search({ query: "Always use pnpm" }).length, 1);
assert.equal(store.search({ tags: ["monorepo"] }).length, 0, "old tags replaced");
assert.ok(updated!.updated >= a.updated);

assert.equal(store.update("nope", { content: "x" }), undefined);

// Delete removes from every index
assert.equal(store.delete(c.id), true);
assert.equal(store.search({ query: "edit tool" }).length, 0);
assert.equal(store.census().count, 2);
assert.equal(store.delete(c.id), false);

// FTS metacharacters in queries don't throw
assert.doesNotThrow(() => store.search({ query: 'pnpm OR "unclosed' }));

store.close();
console.log("memory-store smoke test: all assertions passed");
