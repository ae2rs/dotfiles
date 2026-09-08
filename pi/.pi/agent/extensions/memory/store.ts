/**
 * SQLite-backed memory store. No dependencies beyond node:sqlite (Node 22.5+).
 *
 * Two tables: `memories` (source of truth) and `memory_tags`, plus an FTS5
 * virtual table kept in sync on every write. All multi-table writes happen in
 * transactions so the FTS index can never drift from the memories table.
 */
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface MemoryEntry {
	id: string;
	content: string;
	type: string;
	scope: string;
	tags: string[];
	created: string;
	updated: string;
}

export interface SearchFilter {
	query?: string;
	type?: string;
	tags?: string[];
	/** "global", a project name, or "all" (no scope filter). */
	scope?: string;
	limit?: number;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'fact',
  scope TEXT NOT NULL DEFAULT 'global',
  created TEXT NOT NULL,
  updated TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS memory_tags (
  memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY (memory_id, tag)
);
CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(id UNINDEXED, content);
`;

function newId(): string {
	return Math.random().toString(36).slice(2, 10);
}

function now(): string {
	return new Date().toISOString();
}

/** Escape free text into a safe FTS5 MATCH expression: ANDed quoted tokens. */
function toFtsQuery(text: string): string {
	return text
		.split(/\s+/)
		.filter(Boolean)
		.map((tok) => `"${tok.replace(/"/g, '""')}"`)
		.join(" ");
}

export class MemoryStore {
	private db: DatabaseSync;

	constructor(path: string) {
		if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
		this.db = new DatabaseSync(path);
		this.db.exec("PRAGMA journal_mode = WAL");
		this.db.exec("PRAGMA foreign_keys = ON");
		this.db.exec(SCHEMA);
	}

	close(): void {
		this.db.close();
	}

	save(input: { content: string; type?: string; tags?: string[]; scope?: string; created?: string; updated?: string }): MemoryEntry {
		const id = newId();
		const ts = now();
		const created = input.created ?? ts;
		const updated = input.updated ?? ts;
		const tags = normalizeTags(input.tags);
		this.db.exec("BEGIN");
		try {
			this.db
				.prepare("INSERT INTO memories (id, content, type, scope, created, updated) VALUES (?, ?, ?, ?, ?, ?)")
				.run(id, input.content, input.type ?? "fact", input.scope ?? "global", created, updated);
			this.db.prepare("INSERT INTO memories_fts (id, content) VALUES (?, ?)").run(id, input.content);
			for (const tag of tags) {
				this.db.prepare("INSERT INTO memory_tags (memory_id, tag) VALUES (?, ?)").run(id, tag);
			}
			this.db.exec("COMMIT");
		} catch (err) {
			this.db.exec("ROLLBACK");
			throw err;
		}
		return { id, content: input.content, type: input.type ?? "fact", scope: input.scope ?? "global", tags, created, updated };
	}

	get(id: string): MemoryEntry | undefined {
		const row = this.db.prepare("SELECT * FROM memories WHERE id = ?").get(id) as
			| Omit<MemoryEntry, "tags">
			| undefined;
		return row ? { ...row, tags: this.tagsFor(id) } : undefined;
	}

	update(id: string, patch: { content?: string; type?: string; tags?: string[] }): MemoryEntry | undefined {
		const existing = this.get(id);
		if (!existing) return undefined;
		const content = patch.content ?? existing.content;
		const type = patch.type ?? existing.type;
		const tags = patch.tags !== undefined ? normalizeTags(patch.tags) : existing.tags;
		const ts = now();
		this.db.exec("BEGIN");
		try {
			this.db
				.prepare("UPDATE memories SET content = ?, type = ?, updated = ? WHERE id = ?")
				.run(content, type, ts, id);
			if (patch.content !== undefined) {
				this.db.prepare("DELETE FROM memories_fts WHERE id = ?").run(id);
				this.db.prepare("INSERT INTO memories_fts (id, content) VALUES (?, ?)").run(id, content);
			}
			if (patch.tags !== undefined) {
				this.db.prepare("DELETE FROM memory_tags WHERE memory_id = ?").run(id);
				for (const tag of tags) {
					this.db.prepare("INSERT INTO memory_tags (memory_id, tag) VALUES (?, ?)").run(id, tag);
				}
			}
			this.db.exec("COMMIT");
		} catch (err) {
			this.db.exec("ROLLBACK");
			throw err;
		}
		return { id, content, type, scope: existing.scope, tags, created: existing.created, updated: ts };
	}

	delete(id: string): boolean {
		const existing = this.get(id);
		if (!existing) return false;
		this.db.exec("BEGIN");
		try {
			this.db.prepare("DELETE FROM memories_fts WHERE id = ?").run(id);
			this.db.prepare("DELETE FROM memory_tags WHERE memory_id = ?").run(id);
			this.db.prepare("DELETE FROM memories WHERE id = ?").run(id);
			this.db.exec("COMMIT");
		} catch (err) {
			this.db.exec("ROLLBACK");
			throw err;
		}
		return true;
	}

	search(filter: SearchFilter): MemoryEntry[] {
		const limit = Math.min(filter.limit ?? 10, 100);
		const where: string[] = [];
		const params: string[] = [];

		let from = "memories m";
		if (filter.query?.trim()) {
			from += " JOIN memories_fts f ON f.id = m.id";
			where.push("memories_fts MATCH ?");
			params.push(toFtsQuery(filter.query));
		}
		if (filter.type) {
			where.push("m.type = ?");
			params.push(filter.type);
		}
		if (filter.scope && filter.scope !== "all") {
			where.push("m.scope IN ('global', ?)");
			params.push(filter.scope);
		}
		for (const tag of normalizeTags(filter.tags)) {
			where.push("EXISTS (SELECT 1 FROM memory_tags t WHERE t.memory_id = m.id AND t.tag = ?)");
			params.push(tag);
		}

		const orderBy = filter.query?.trim() ? "bm25(memories_fts)" : "m.updated DESC";
		const sql = `SELECT m.* FROM ${from}${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY ${orderBy} LIMIT ?`;
		const rows = this.db.prepare(sql).all(...params, limit) as unknown as Omit<MemoryEntry, "tags">[];
		return rows.map((row) => ({ ...row, tags: this.tagsFor(row.id) }));
	}

	/** Aggregate stats for the prompt census: total count plus type/tag vocabulary. */
	census(): { count: number; types: string[]; tags: string[] } {
		const count = (this.db.prepare("SELECT COUNT(*) AS n FROM memories").get() as { n: number }).n;
		const types = (this.db.prepare("SELECT DISTINCT type FROM memories ORDER BY type").all() as { type: string }[]).map(
			(r) => r.type,
		);
		const tags = (this.db.prepare("SELECT DISTINCT tag FROM memory_tags ORDER BY tag").all() as { tag: string }[]).map(
			(r) => r.tag,
		);
		return { count, types, tags };
	}

	tagCounts(): Array<{ tag: string; count: number }> {
		return this.db
			.prepare("SELECT tag, COUNT(*) AS count FROM memory_tags GROUP BY tag ORDER BY count DESC, tag")
			.all() as Array<{ tag: string; count: number }>;
	}

	private tagsFor(id: string): string[] {
		return (
			this.db.prepare("SELECT tag FROM memory_tags WHERE memory_id = ? ORDER BY tag").all(id) as { tag: string }[]
		).map((r) => r.tag);
	}
}

function normalizeTags(tags?: string[]): string[] {
	return [...new Set((tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean))];
}
