/**
 * usage — unified subscription-usage service for the statusline footer.
 *
 * Folds the old claude-usage.ts and kimi-usage.ts extensions into one module
 * and adds Codex quota capture from response headers. Exposes a single
 * UsageReading shape per provider; the footer picks the reading for the
 * active model's provider.
 *
 *   Claude (pi-claude):  GET api.anthropic.com/api/oauth/usage (5h window),
 *                        token from env → ~/.claude/.credentials.json →
 *                        macOS Keychain ("Claude Code-credentials").
 *   Kimi (kimi-coding):  GET api.kimi.com/coding/v1/usages (5h window only),
 *                        token from pi auth.json →
 *                        ~/.kimi-code/credentials/kimi-code.json.
 *   Codex (openai-codex): no polling — quota rides on every response in the
 *                        x-codex-primary-* / x-codex-secondary-* headers,
 *                        captured via the after_provider_response event.
 *
 * Refresh cadence for the polled providers matches the old extensions: a
 * fresh fetch on session start, model select, and after each agent run
 * (throttled to 30 s), plus a 5-minute background poll.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

export type UsageProvider = "pi-claude" | "kimi-coding" | "openai-codex";
export type UsageKind = "5h" | "wk";

export interface UsageReading {
	kind: UsageKind;
	/** 0–100 remaining in the window */
	remainingPct: number;
	/** epoch ms when the window resets */
	resetsAt?: number;
}

export interface UsageService {
	getUsage(provider: UsageProvider | undefined): UsageReading | undefined;
	/** Subscribe to reading updates. Returns an unsubscribe function. */
	onChange(callback: () => void): () => void;
}

export function usageProviderOf(model: { provider?: string } | undefined): UsageProvider | undefined {
	const provider = model?.provider;
	if (provider === "pi-claude" || provider === "kimi-coding" || provider === "openai-codex") {
		return provider;
	}
	return undefined;
}

const FETCH_INTERVAL_MS = 5 * 60 * 1000;
const MIN_FETCH_GAP_MS = 30 * 1000; // throttle event-driven fetches
const EXPIRY_MARGIN_MS = 60 * 1000; // treat tokens expiring within a minute as expired

// ---------------------------------------------------------------------------
// Claude (ported verbatim from claude-usage.ts)
// ---------------------------------------------------------------------------

const CLAUDE_USAGE_URL = "https://api.anthropic.com/api/oauth/usage";

interface ClaudeWindowUsage {
	utilization?: number;
	resets_at?: string | null;
}

interface ClaudeUsageResponse {
	five_hour?: ClaudeWindowUsage | null;
}

function readClaudeCredentialsFileToken(): string | undefined {
	const configDir = process.env.CLAUDE_CONFIG_DIR?.trim() || join(homedir(), ".claude");
	const path = join(configDir, ".credentials.json");
	if (!existsSync(path)) return undefined;
	try {
		const parsed = JSON.parse(readFileSync(path, "utf8"));
		const oauth = parsed?.claudeAiOauth;
		if (typeof oauth?.accessToken !== "string" || !oauth.accessToken) return undefined;
		if (typeof oauth.expiresAt === "number" && oauth.expiresAt <= Date.now() + EXPIRY_MARGIN_MS) return undefined;
		return oauth.accessToken;
	} catch {
		return undefined;
	}
}

function readClaudeKeychainToken(): string | undefined {
	if (platform() !== "darwin") return undefined;
	try {
		const raw = execFileSync("security", ["find-generic-password", "-s", "Claude Code-credentials", "-w"], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
			timeout: 5000,
		}).trim();
		const oauth = JSON.parse(raw)?.claudeAiOauth;
		if (typeof oauth?.accessToken !== "string" || !oauth.accessToken) return undefined;
		if (typeof oauth.expiresAt === "number" && oauth.expiresAt <= Date.now() + EXPIRY_MARGIN_MS) return undefined;
		return oauth.accessToken;
	} catch {
		return undefined;
	}
}

function resolveClaudeToken(): string | undefined {
	const env = process.env.CLAUDE_CODE_OAUTH_TOKEN?.trim();
	if (env) return env;
	return readClaudeCredentialsFileToken() ?? readClaudeKeychainToken();
}

/** Parse the Anthropic OAuth usage response body into a reading. Exported for tests. */
export function parseClaudeUsage(body: ClaudeUsageResponse | null | undefined): UsageReading | undefined {
	const fiveHour = body?.five_hour;
	if (!fiveHour || typeof fiveHour.utilization !== "number") return undefined;
	const resetMs = fiveHour.resets_at ? Date.parse(fiveHour.resets_at) : Number.NaN;
	return {
		kind: "5h",
		remainingPct: Math.max(0, Math.round(100 - fiveHour.utilization)),
		resetsAt: Number.isFinite(resetMs) ? resetMs : undefined,
	};
}

async function fetchClaudeUsage(token: string): Promise<UsageReading | undefined> {
	const response = await fetch(CLAUDE_USAGE_URL, {
		headers: {
			Authorization: `Bearer ${token}`,
			"anthropic-beta": "oauth-2025-04-20",
			"User-Agent": "claude-code/2.1.0",
		},
		signal: AbortSignal.timeout(10_000),
	});
	if (!response.ok) return undefined;
	return parseClaudeUsage((await response.json()) as ClaudeUsageResponse);
}

// ---------------------------------------------------------------------------
// Kimi (ported verbatim from kimi-usage.ts)
// ---------------------------------------------------------------------------

function kimiUsageUrl(): string {
	const base = (process.env.KIMI_CODE_BASE_URL?.trim() || "https://api.kimi.com/coding/v1").replace(/\/+$/, "");
	return `${base}/usages`;
}

interface KimiRawWindowDetail {
	limit?: string;
	used?: string;
	remaining?: string;
	resetTime?: string;
}

interface KimiUsageResponse {
	usage?: KimiRawWindowDetail | null;
	limits?: Array<{
		window?: { duration?: number; timeUnit?: string };
		detail?: KimiRawWindowDetail;
	}> | null;
}

function readKimiPiAuthToken(): string | undefined {
	const agentDir = process.env.PI_CODING_AGENT_DIR?.trim() || join(homedir(), ".pi", "agent");
	const path = join(agentDir, "auth.json");
	if (!existsSync(path)) return undefined;
	try {
		const parsed = JSON.parse(readFileSync(path, "utf8"));
		const entry = parsed?.["kimi-coding"];
		if (typeof entry?.access !== "string" || !entry.access) return undefined;
		if (typeof entry.expires === "number" && entry.expires <= Date.now() + EXPIRY_MARGIN_MS) return undefined;
		return entry.access;
	} catch {
		return undefined;
	}
}

function readKimiCliToken(): string | undefined {
	const path = join(homedir(), ".kimi-code", "credentials", "kimi-code.json");
	if (!existsSync(path)) return undefined;
	try {
		const parsed = JSON.parse(readFileSync(path, "utf8"));
		if (typeof parsed?.access_token !== "string" || !parsed.access_token) return undefined;
		// kimi CLI stores expires_at in epoch seconds
		if (typeof parsed.expires_at === "number" && parsed.expires_at * 1000 <= Date.now() + EXPIRY_MARGIN_MS) {
			return undefined;
		}
		return parsed.access_token;
	} catch {
		return undefined;
	}
}

function resolveKimiToken(): string | undefined {
	return readKimiPiAuthToken() ?? readKimiCliToken();
}

function kimiWindowToReading(detail: KimiRawWindowDetail | undefined, kind: UsageKind): UsageReading | undefined {
	if (!detail) return undefined;
	const limit = Number(detail.limit);
	const remaining = Number(detail.remaining);
	const used = Number(detail.used);
	if (!Number.isFinite(limit) || limit <= 0) return undefined;
	// Kimi omits `remaining` once a window is exhausted; derive it from `used`
	// so a full 5h quota remains visible as 0% remaining.
	const remainingPct = Number.isFinite(remaining)
		? (remaining / limit) * 100
		: Number.isFinite(used)
			? 100 - (used / limit) * 100
			: Number.NaN;
	if (!Number.isFinite(remainingPct)) return undefined;
	const resetMs = detail.resetTime ? Date.parse(detail.resetTime) : Number.NaN;
	return {
		kind,
		remainingPct: Math.max(0, Math.min(100, Math.round(remainingPct))),
		resetsAt: Number.isFinite(resetMs) ? resetMs : undefined,
	};
}

/** Parse the Kimi usages response body into a reading. Exported for tests. */
export function parseKimiUsage(body: KimiUsageResponse | null | undefined): UsageReading | undefined {
	if (!body) return undefined;
	// Display only Kimi's short (5h / ≤360-minute) window. The weekly
	// summary is intentionally ignored, including while the short window is full.
	for (const row of body.limits ?? []) {
		const w = row?.window;
		if (w?.timeUnit === "TIME_UNIT_MINUTE" && typeof w.duration === "number" && w.duration <= 360) {
			const reading = kimiWindowToReading(row.detail, "5h");
			if (reading) return reading;
		}
	}
	return undefined;
}

async function fetchKimiUsage(token: string): Promise<UsageReading | undefined> {
	const response = await fetch(kimiUsageUrl(), {
		headers: {
			Authorization: `Bearer ${token}`,
			"User-Agent": "kimi-code-cli/1.0.0",
		},
		signal: AbortSignal.timeout(10_000),
	});
	if (!response.ok) return undefined;
	return parseKimiUsage((await response.json()) as KimiUsageResponse);
}

// ---------------------------------------------------------------------------
// Codex (header-driven; parsing adapted from @wishx127/pi-tokyo-night)
// ---------------------------------------------------------------------------

function parseHeaderNumber(value: string | undefined): number | undefined {
	if (value == null || value === "") return undefined;
	const n = Number(value);
	return Number.isFinite(n) ? n : undefined;
}

function codexWindowToReading(
	used: number | undefined,
	windowMinutes: number | undefined,
	resetAfterSeconds: number | undefined,
	now: number,
): UsageReading | undefined {
	if (used == null || windowMinutes == null || resetAfterSeconds == null) return undefined;
	return {
		kind: windowMinutes <= 360 ? "5h" : "wk",
		remainingPct: Math.max(0, Math.round(100 - used)),
		resetsAt: now + resetAfterSeconds * 1000,
	};
}

/**
 * Parse Codex quota response headers into a reading. Prefers the primary
 * (session) window and falls back to the secondary (weekly) window.
 * Exported for tests.
 */
export function parseCodexHeaders(headers: Record<string, string>, now = Date.now()): UsageReading | undefined {
	const lower: Record<string, string> = {};
	for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
	return (
		codexWindowToReading(
			parseHeaderNumber(lower["x-codex-primary-used-percent"]),
			parseHeaderNumber(lower["x-codex-primary-window-minutes"]),
			parseHeaderNumber(lower["x-codex-primary-reset-after-seconds"]),
			now,
		) ??
		codexWindowToReading(
			parseHeaderNumber(lower["x-codex-secondary-used-percent"]),
			parseHeaderNumber(lower["x-codex-secondary-window-minutes"]),
			parseHeaderNumber(lower["x-codex-secondary-reset-after-seconds"]),
			now,
		)
	);
}

// ---------------------------------------------------------------------------
// Reset-time formatting (shared by the footer)
// ---------------------------------------------------------------------------

export function formatResetsAt(reading: UsageReading, now = Date.now()): string | undefined {
	if (!reading.resetsAt) return undefined;
	const date = new Date(reading.resetsAt);
	if (reading.kind === "5h") {
		return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
	}
	return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export function createUsageService(pi: ExtensionAPI): UsageService {
	const readings = new Map<UsageProvider, UsageReading>();
	const lastFetchAt = new Map<UsageProvider, number>();
	const listeners = new Set<() => void>();
	let fetchTimer: ReturnType<typeof setInterval> | undefined;
	// Bumped on every start/stop so stale timers and in-flight fetches from a
	// replaced/reloaded session bail before touching the now-dead ctx.
	let generation = 0;

	function emit(): void {
		for (const cb of listeners) cb();
	}

	async function refresh(ctx: ExtensionContext, force = false): Promise<void> {
		const gen = generation;
		if (gen === 0) return;
		const provider = usageProviderOf(ctx.model);
		// Codex is header-driven; nothing to poll.
		if (provider !== "pi-claude" && provider !== "kimi-coding") return;
		const now = Date.now();
		if (!force && now - (lastFetchAt.get(provider) ?? 0) < MIN_FETCH_GAP_MS) return;
		lastFetchAt.set(provider, now);
		const token = provider === "pi-claude" ? resolveClaudeToken() : resolveKimiToken();
		if (!token) return; // keep showing the previous reading
		try {
			const reading = provider === "pi-claude" ? await fetchClaudeUsage(token) : await fetchKimiUsage(token);
			if (reading && gen === generation) {
				readings.set(provider, reading);
				emit();
			}
		} catch {
			// Network blip — keep the previous reading rather than blanking it.
		}
	}

	function start(ctx: ExtensionContext): void {
		stop();
		const gen = generation;
		void refresh(ctx, true);
		// Background poll so the reading moves while a long agent run is in flight.
		fetchTimer = setInterval(() => {
			if (gen === generation) void refresh(ctx);
		}, FETCH_INTERVAL_MS);
	}

	function stop(): void {
		generation++;
		if (fetchTimer) clearInterval(fetchTimer);
		fetchTimer = undefined;
	}

	pi.on("session_start", (_event, ctx) => start(ctx));
	pi.on("model_select", (_event, ctx) => void refresh(ctx, true));
	pi.on("agent_settled", (_event, ctx) => void refresh(ctx, true));
	pi.on("after_provider_response", (event, ctx) => {
		if (usageProviderOf(ctx.model) !== "openai-codex") return;
		const reading = parseCodexHeaders(event.headers);
		if (reading) {
			readings.set("openai-codex", reading);
			emit();
		}
	});
	pi.on("session_shutdown", () => stop());

	return {
		getUsage(provider) {
			return provider ? readings.get(provider) : undefined;
		},
		onChange(callback) {
			listeners.add(callback);
			return () => listeners.delete(callback);
		},
	};
}
