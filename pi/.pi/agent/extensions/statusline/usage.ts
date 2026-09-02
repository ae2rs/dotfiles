/**
 * usage — unified subscription-usage service for the statusline footer.
 *
 * Folds the old claude-usage.ts and kimi-usage.ts extensions into one module
 * and adds Codex monthly-allowance polling. Exposes a single
 * UsageReading shape per provider; the footer picks the reading for the
 * active model's provider.
 *
 *   Claude (pi-claude):  GET api.anthropic.com/api/oauth/usage (5h window),
 *                        token from env → ~/.claude/.credentials.json →
 *                        macOS Keychain ("Claude Code-credentials").
 *   Kimi (kimi-coding):  GET api.kimi.com/coding/v1/usages (5h window only),
 *                        token from pi auth.json →
 *                        ~/.kimi-code/credentials/kimi-code.json.
 *   Codex (openai-codex): GET chatgpt.com/backend-api/codex/usage, monthly
 *                        allowance from spend_control.individual_limit,
 *                        token from pi auth.json → ~/.codex/auth.json.
 *
 * Refresh cadence for the polled providers matches the old extensions: a
 * fresh fetch on session start, model select, and after each agent run
 * (throttled to 30 s), plus a 5-minute background poll.
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

export type UsageProvider = "pi-claude" | "kimi-coding" | "openai-codex";
export type UsageKind = "5h" | "wk" | "mo";

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
// Codex (monthly allowance)
// ---------------------------------------------------------------------------

const CODEX_USAGE_URL = "https://chatgpt.com/backend-api/codex/usage";
const CODEX_USAGE_TIMEOUT_MS = 10_000;
const CODEX_USAGE_MAX_BYTES = 64 * 1024;

// ChatGPT's edge returns 403 to Node's and curl's TLS clients for this endpoint,
// while Codex-compatible Python urllib succeeds. Credentials arrive only over
// stdin, so they never appear in a process command line or diagnostic output.
const CODEX_USAGE_REQUEST_SCRIPT = String.raw`
import json
import sys
import urllib.request

credentials = json.load(sys.stdin)
request = urllib.request.Request(
    ${JSON.stringify(CODEX_USAGE_URL)},
    headers={
        "Authorization": "Bearer " + credentials["accessToken"],
        "chatgpt-account-id": credentials["accountId"],
        "originator": "pi",
        "User-Agent": "pi-statusline",
    },
)
with urllib.request.urlopen(request, timeout=10) as response:
    if response.status != 200:
        raise RuntimeError("unexpected Codex usage status")
    sys.stdout.write(response.read().decode("utf-8"))
`;

interface CodexMonthlyLimit {
	remaining_percent?: unknown;
	reset_at?: unknown;
	reset_after_seconds?: unknown;
}

interface CodexUsageResponse {
	spend_control?: {
		individual_limit?: CodexMonthlyLimit | null;
	} | null;
}

interface CodexCredentials {
	accessToken: string;
	accountId: string;
}

function finiteCodexNumber(value: unknown): number | undefined {
	if (typeof value !== "number" && typeof value !== "string") return undefined;
	if (typeof value === "string" && !value.trim()) return undefined;
	const number = Number(value);
	return Number.isFinite(number) ? number : undefined;
}

/** Parse Codex's monthly spend-control allowance into a footer reading. Exported for tests. */
export function parseCodexUsage(body: CodexUsageResponse | null | undefined, now = Date.now()): UsageReading | undefined {
	const limit = body?.spend_control?.individual_limit;
	if (!limit) return undefined;
	const remainingPct = finiteCodexNumber(limit.remaining_percent);
	if (remainingPct == null) return undefined;

	const absoluteResetSeconds = finiteCodexNumber(limit.reset_at);
	const resetAfterSeconds = finiteCodexNumber(limit.reset_after_seconds);
	const resetsAt = absoluteResetSeconds != null
		? absoluteResetSeconds * 1000
		: resetAfterSeconds != null
			? now + resetAfterSeconds * 1000
			: undefined;

	return {
		kind: "mo",
		remainingPct: Math.max(0, Math.min(100, Math.round(remainingPct))),
		resetsAt,
	};
}

function readCodexPiCredentials(): CodexCredentials | undefined {
	const agentDir = process.env.PI_CODING_AGENT_DIR?.trim() || join(homedir(), ".pi", "agent");
	const path = join(agentDir, "auth.json");
	if (!existsSync(path)) return undefined;
	try {
		const entry = JSON.parse(readFileSync(path, "utf8"))?.["openai-codex"];
		if (typeof entry?.access !== "string" || !entry.access) return undefined;
		if (typeof entry?.accountId !== "string" || !entry.accountId) return undefined;
		if (typeof entry.expires === "number" && entry.expires <= Date.now() + EXPIRY_MARGIN_MS) return undefined;
		return { accessToken: entry.access, accountId: entry.accountId };
	} catch {
		return undefined;
	}
}

function readCodexCliCredentials(): CodexCredentials | undefined {
	const path = join(homedir(), ".codex", "auth.json");
	if (!existsSync(path)) return undefined;
	try {
		const tokens = JSON.parse(readFileSync(path, "utf8"))?.tokens;
		if (typeof tokens?.access_token !== "string" || !tokens.access_token) return undefined;
		if (typeof tokens?.account_id !== "string" || !tokens.account_id) return undefined;
		return { accessToken: tokens.access_token, accountId: tokens.account_id };
	} catch {
		return undefined;
	}
}

function resolveCodexCredentials(): CodexCredentials | undefined {
	return readCodexPiCredentials() ?? readCodexCliCredentials();
}

function fetchCodexUsage(credentials: CodexCredentials): Promise<UsageReading | undefined> {
	return new Promise((resolve) => {
		const child = spawn("python3", ["-c", CODEX_USAGE_REQUEST_SCRIPT], {
			stdio: ["pipe", "pipe", "ignore"],
		});
		let output = "";
		let settled = false;
		const finish = (reading?: UsageReading) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			child.kill();
			resolve(reading);
		};
		const timeout = setTimeout(() => finish(), CODEX_USAGE_TIMEOUT_MS);

		child.stdout.on("data", (chunk: Buffer | string) => {
			output += chunk.toString();
			if (Buffer.byteLength(output) > CODEX_USAGE_MAX_BYTES) finish();
		});
		child.once("error", () => finish());
		child.once("close", (code) => {
			if (code !== 0) return finish();
			try {
				finish(parseCodexUsage(JSON.parse(output) as CodexUsageResponse));
			} catch {
				finish();
			}
		});
		child.stdin.once("error", () => finish());
		child.stdin.end(JSON.stringify(credentials));
	});
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
		if (!provider) return;
		const now = Date.now();
		if (!force && now - (lastFetchAt.get(provider) ?? 0) < MIN_FETCH_GAP_MS) return;
		lastFetchAt.set(provider, now);
		try {
			let reading: UsageReading | undefined;
			if (provider === "pi-claude") {
				const token = resolveClaudeToken();
				if (!token) return; // keep showing the previous reading
				reading = await fetchClaudeUsage(token);
			} else if (provider === "kimi-coding") {
				const token = resolveKimiToken();
				if (!token) return; // keep showing the previous reading
				reading = await fetchKimiUsage(token);
			} else {
				const credentials = resolveCodexCredentials();
				if (!credentials) return; // keep showing the previous reading
				reading = await fetchCodexUsage(credentials);
			}
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
		if (usageProviderOf(ctx.model)) {
			void refresh(ctx, true);
		} else {
			// Pi assigns the startup model after session_start. Retry on the next
			// turn so an idle Codex footer does not wait for its first agent run.
			setTimeout(() => {
				if (gen === generation) void refresh(ctx, true);
			}, 0);
		}
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
