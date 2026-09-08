/**
 * SQLite-backed memory store. No dependencies beyond node:sqlite (Node 22.5+).
 *
 * Memories are small, titled records with tags and undirected links to related
 * memories. FTS indexes titles and content; every multi-table write is
 * transactional so indexes and links cannot drift from the source records.
 */
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface MemoryEntry {
	id: string;
	title: string;
	content: string;
	type: string;
	scope: string;
	tags: string[];
	relatedIds: string[];
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

export interface MemorySearchResult extends MemoryEntry {
	/** Higher is more relevant; only present for full-text searches. */
	relevance?: number;
}

type SaveInput = {
	title?: string;
	content: string;
	type?: string;
	tags?: string[];
	relatedIds?: string[];
	scope?: string;
	created?: string;
	updated?: string;
};

type UpdatePatch = {
	title?: string;
	content?: string;
	type?: string;
	tags?: string[];
	relatedIds?: string[];
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
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
CREATE TABLE IF NOT EXISTS memory_relations (
  memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  related_memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  PRIMARY KEY (memory_id, related_memory_id),
  CHECK (memory_id < related_memory_id)
);
CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(id UNINDEXED, title, content);
`;

function newId(): string {
	return Math.random().toString(36).slice(2, 10);
}

function now(): string {
	return new Date().toISOString();
}

function titleFromContent(content: string): string {
	const firstLine = content.trim().split("\n", 1)[0] ?? "";
	return firstLine.length <= 100 ? firstLine || "Untitled memory" : `${firstLine.slice(0, 97)}...`;
}

function normalizeTitle(title: string | undefined, content: string): string {
	return title?.trim() || titleFromContent(content);
}

function normalizeTags(tags?: string[]): string[] {
	return [...new Set((tags ?? []).map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
}

function normalizeIds(ids?: string[]): string[] {
	return [...new Set((ids ?? []).map((id) => id.trim()).filter(Boolean))];
}

/** Escape free text into a safe FTS5 MATCH expression: ANDed quoted tokens. */
function toFtsQuery(text: string): string {
	return text
		.split(/\s+/)
		.filter(Boolean)
		.map((token) => `"${token.replace(/"/g, '""')}"`)
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
		this.migrate();
	}

	close(): void {
		this.db.close();
	}

	save(input: SaveInput): MemoryEntry {
		const id = newId();
		const ts = now();
		const title = normalizeTitle(input.title, input.content);
		const created = input.created ?? ts;
		const updated = input.updated ?? ts;
		const tags = normalizeTags(input.tags);
		const relatedIds = normalizeIds(input.relatedIds);
		this.assertValidRelatedIds(id, relatedIds);

		this.db.exec("BEGIN");
		try {
			this.db
				.prepare("INSERT INTO memories (id, title, content, type, scope, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?)")
				.run(id, title, input.content, input.type ?? "fact", input.scope ?? "global", created, updated);
			this.db.prepare("INSERT INTO memories_fts (id, title, content) VALUES (?, ?, ?)").run(id, title, input.content);
			this.replaceTags(id, tags);
			this.replaceRelations(id, relatedIds);
			this.db.exec("COMMIT");
		} catch (err) {
			this.db.exec("ROLLBACK");
			throw err;
		}
		return { id, title, content: input.content, type: input.type ?? "fact", scope: input.scope ?? "global", tags, relatedIds, created, updated };
	}

	get(id: string): MemoryEntry | undefined {
		const row = this.db.prepare("SELECT * FROM memories WHERE id = ?").get(id) as
			| Omit<MemoryEntry, "tags" | "relatedIds">
			| undefined;
		return row ? { ...row, tags: this.tagsFor(id), relatedIds: this.relatedIdsFor(id) } : undefined;
	}

	update(id: string, patch: UpdatePatch): MemoryEntry | undefined {
		const existing = this.get(id);
		if (!existing) return undefined;
		const title = patch.title === undefined ? existing.title : normalizeTitle(patch.title, patch.content ?? existing.content);
		const content = patch.content ?? existing.content;
		const type = patch.type ?? existing.type;
		const tags = patch.tags === undefined ? existing.tags : normalizeTags(patch.tags);
		const relatedIds = patch.relatedIds === undefined ? existing.relatedIds : normalizeIds(patch.relatedIds);
		this.assertValidRelatedIds(id, relatedIds);
		const ts = now();

		this.db.exec("BEGIN");
		try {
			this.db.prepare("UPDATE memories SET title = ?, content = ?, type = ?, updated = ? WHERE id = ?").run(title, content, type, ts, id);
			if (patch.title !== undefined || patch.content !== undefined) {
				this.db.prepare("DELETE FROM memories_fts WHERE id = ?").run(id);
				this.db.prepare("INSERT INTO memories_fts (id, title, content) VALUES (?, ?, ?)").run(id, title, content);
			}
			if (patch.tags !== undefined) this.replaceTags(id, tags);
			if (patch.relatedIds !== undefined) this.replaceRelations(id, relatedIds);
			this.db.exec("COMMIT");
		} catch (err) {
			this.db.exec("ROLLBACK");
			throw err;
		}
		return { id, title, content, type, scope: existing.scope, tags, relatedIds, created: existing.created, updated: ts };
	}

	delete(id: string): boolean {
		if (!this.get(id)) return false;
		this.db.exec("BEGIN");
		try {
			this.db.prepare("DELETE FROM memories_fts WHERE id = ?").run(id);
			this.db.prepare("DELETE FROM memories WHERE id = ?").run(id);
			this.db.exec("COMMIT");
		} catch (err) {
			this.db.exec("ROLLBACK");
			throw err;
		}
		return true;
	}

	search(filter: SearchFilter): MemorySearchResult[] {
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

		const hasQuery = Boolean(filter.query?.trim());
		const columns = hasQuery ? "m.*, -bm25(memories_fts) AS relevance" : "m.*";
		const orderBy = hasQuery ? "bm25(memories_fts)" : "m.updated DESC";
		const sql = `SELECT ${columns} FROM ${from}${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY ${orderBy} LIMIT ?`;
		const rows = this.db.prepare(sql).all(...params, limit) as unknown as Array<
			Omit<MemoryEntry, "tags" | "relatedIds"> & { relevance?: number }
		>;
		return rows.map(({ relevance, ...row }) => ({
			...row,
			tags: this.tagsFor(row.id),
			relatedIds: this.relatedIdsFor(row.id),
			...(relevance === undefined ? {} : { relevance }),
		}));
	}

	/** Aggregate stats for the prompt census: total count plus type/tag vocabulary. */
	census(): { count: number; types: string[]; tags: string[] } {
		const count = (this.db.prepare("SELECT COUNT(*) AS n FROM memories").get() as { n: number }).n;
		const types = (this.db.prepare("SELECT DISTINCT type FROM memories ORDER BY type").all() as { type: string }[]).map(
			(row) => row.type,
		);
		const tags = (this.db.prepare("SELECT DISTINCT tag FROM memory_tags ORDER BY tag").all() as { tag: string }[]).map(
			(row) => row.tag,
		);
		return { count, types, tags };
	}

	tagCounts(): Array<{ tag: string; count: number }> {
		return this.db
			.prepare("SELECT tag, COUNT(*) AS count FROM memory_tags GROUP BY tag ORDER BY count DESC, tag")
			.all() as Array<{ tag: string; count: number }>;
	}

	private migrate(): void {
		const columns = this.db.prepare("PRAGMA table_info(memories)").all() as { name: string }[];
		if (!columns.some((column) => column.name === "title")) {
			this.db.exec("ALTER TABLE memories ADD COLUMN title TEXT NOT NULL DEFAULT ''");
		}
		this.db.prepare("UPDATE memories SET title = substr(trim(content), 1, 100) WHERE title = ''").run();

		const fts = this.db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'memories_fts'").get() as
			| { sql: string }
			| undefined;
		if (!fts?.sql.includes("title")) {
			this.db.exec("DROP TABLE IF EXISTS memories_fts");
			this.db.exec("CREATE VIRTUAL TABLE memories_fts USING fts5(id UNINDEXED, title, content)");
			this.db.exec("INSERT INTO memories_fts (id, title, content) SELECT id, title, content FROM memories");
		}
	}

	private assertValidRelatedIds(id: string, relatedIds: string[]): void {
		if (relatedIds.includes(id)) throw new Error("A memory cannot be related to itself.");
		if (relatedIds.length === 0) return;
		const placeholders = relatedIds.map(() => "?").join(", ");
		const rows = this.db.prepare(`SELECT id FROM memories WHERE id IN (${placeholders})`).all(...relatedIds) as { id: string }[];
		const found = new Set(rows.map((row) => row.id));
		const missing = relatedIds.filter((relatedId) => !found.has(relatedId));
		if (missing.length > 0) throw new Error(`Related memories do not exist: ${missing.join(", ")}`);
	}

	private replaceTags(id: string, tags: string[]): void {
		this.db.prepare("DELETE FROM memory_tags WHERE memory_id = ?").run(id);
		for (const tag of tags) {
			this.db.prepare("INSERT INTO memory_tags (memory_id, tag) VALUES (?, ?)").run(id, tag);
		}
	}

	private replaceRelations(id: string, relatedIds: string[]): void {
		this.db.prepare("DELETE FROM memory_relations WHERE memory_id = ? OR related_memory_id = ?").run(id, id);
		for (const relatedId of relatedIds) {
			const [memoryId, relatedMemoryId] = [id, relatedId].sort();
			this.db.prepare("INSERT INTO memory_relations (memory_id, related_memory_id) VALUES (?, ?)").run(memoryId, relatedMemoryId);
		}
	}

	private tagsFor(id: string): string[] {
		return (
			this.db.prepare("SELECT tag FROM memory_tags WHERE memory_id = ? ORDER BY tag").all(id) as { tag: string }[]
		).map((row) => row.tag);
	}

	private relatedIdsFor(id: string): string[] {
		return (
			this.db
				.prepare(
					"SELECT CASE WHEN memory_id = ? THEN related_memory_id ELSE memory_id END AS id FROM memory_relations WHERE memory_id = ? OR related_memory_id = ? ORDER BY id",
				)
				.all(id, id, id) as { id: string }[]
		).map((row) => row.id);
	}
}
