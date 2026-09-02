/**
 * kimi-usage — footer status showing Kimi for Coding window headroom.
 *
 * Mirror of claude-usage.ts for the kimi-coding OAuth provider. Pi routes
 * Kimi models through the Kimi for Coding subscription, whose rate limits
 * are per-account and invisible to pi's token accounting. This extension
 * polls the same endpoint the kimi CLI's /usage uses
 * (GET https://api.kimi.com/coding/v1/usages) and shows the 5-hour window's
 * remaining headroom in the footer, e.g. `5h 81% left · resets 19:40`.
 * Nothing is shown unless the active model's provider is "kimi-coding".
 *
 * Token sources, tried in order (contents never logged):
 *   1. pi's own auth.json (kimi-coding.access) — pi refreshes it itself
 *   2. ~/.kimi-code/credentials/kimi-code.json (kimi CLI OAuth cache)
 *
 * Refresh cadence matches claude-usage: fetch on session start, model
 * select, and after each agent run (throttled), plus a 5-minute background
 * poll; the footer re-renders every minute so the reset countdown ticks.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const PROVIDER_ID = "kimi-coding";
const STATUS_KEY = "kimi-usage";
const FETCH_INTERVAL_MS = 5 * 60 * 1000;
const MIN_FETCH_GAP_MS = 30 * 1000; // throttle event-driven fetches
const RENDER_INTERVAL_MS = 60 * 1000;
const EXPIRY_MARGIN_MS = 60 * 1000; // treat tokens expiring within a minute as expired

function usageUrl(): string {
	const base = (process.env.KIMI_CODE_BASE_URL?.trim() || "https://api.kimi.com/coding/v1").replace(/\/+$/, "");
	return `${base}/usages`;
}

interface UsageWindow {
	/** 0–100 remaining */
	remainingPct: number;
	resetAt?: number; // epoch ms
	/** "5h" for the short window, "wk" for the weekly summary */
	label: "5h" | "wk";
}

interface RawWindowDetail {
	limit?: string;
	used?: string;
	remaining?: string;
	resetTime?: string;
}

interface UsageResponse {
	usage?: RawWindowDetail | null;
	limits?: Array<{
		window?: { duration?: number; timeUnit?: string };
		detail?: RawWindowDetail;
	}> | null;
}

function readPiAuthToken(): string | undefined {
	const agentDir = process.env.PI_CODING_AGENT_DIR?.trim() || join(homedir(), ".pi", "agent");
	const path = join(agentDir, "auth.json");
	if (!existsSync(path)) return undefined;
	try {
		const parsed = JSON.parse(readFileSync(path, "utf8"));
		const entry = parsed?.[PROVIDER_ID];
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

function resolveToken(): string | undefined {
	return readPiAuthToken() ?? readKimiCliToken();
}

function toWindow(detail: RawWindowDetail | undefined, label: "5h" | "wk"): UsageWindow | undefined {
	if (!detail) return undefined;
	const limit = Number(detail.limit);
	const remaining = Number(detail.remaining);
	if (!Number.isFinite(limit) || limit <= 0 || !Number.isFinite(remaining)) return undefined;
	const resetMs = detail.resetTime ? Date.parse(detail.resetTime) : Number.NaN;
	return {
		remainingPct: Math.max(0, Math.round((remaining / limit) * 100)),
		resetAt: Number.isFinite(resetMs) ? resetMs : undefined,
		label,
	};
}

function pickWindow(body: UsageResponse): UsageWindow | undefined {
	// Prefer the short (5h / 300-minute) window, matching claude-usage.
	for (const row of body.limits ?? []) {
		const w = row?.window;
		if (w?.timeUnit === "TIME_UNIT_MINUTE" && typeof w.duration === "number" && w.duration <= 360) {
			const win = toWindow(row.detail, "5h");
			if (win) return win;
		}
	}
	// Fall back to the weekly summary.
	return toWindow(body.usage ?? undefined, "wk");
}

async function fetchUsage(token: string): Promise<UsageWindow | undefined> {
	const response = await fetch(usageUrl(), {
		headers: {
			Authorization: `Bearer ${token}`,
			"User-Agent": "kimi-code-cli/1.0.0",
		},
		signal: AbortSignal.timeout(10_000),
	});
	if (!response.ok) return undefined;
	return pickWindow((await response.json()) as UsageResponse);
}

function formatReset(resetAt: number | undefined, label: "5h" | "wk"): string | undefined {
	if (!resetAt) return undefined;
	const date = new Date(resetAt);
	if (label === "5h") {
		return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
	}
	return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function (pi: ExtensionAPI) {
	let cached: UsageWindow | undefined;
	let lastFetch = 0;
	let fetchTimer: ReturnType<typeof setInterval> | undefined;
	let renderTimer: ReturnType<typeof setInterval> | undefined;
	// Bumped on every start/stop so stale timers and in-flight fetches from a
	// replaced/reloaded session bail before touching the now-dead ctx.
	let generation = 0;

	const isKimiSubscription = (ctx: ExtensionContext): boolean => ctx.model?.provider === PROVIDER_ID;

	function render(ctx: ExtensionContext): void {
		if (!ctx.hasUI) return;
		if (!isKimiSubscription(ctx) || !cached) {
			ctx.ui.setStatus(STATUS_KEY, undefined);
			return;
		}
		const reset = formatReset(cached.resetAt, cached.label);
		const text = `${cached.label} ${cached.remainingPct}% left${reset ? ` · resets ${reset}` : ""}`;
		const color = cached.remainingPct <= 10 ? "error" : cached.remainingPct <= 30 ? "warning" : "muted";
		ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg(color as "muted", text));
	}

	async function refresh(ctx: ExtensionContext, force = false): Promise<void> {
		const gen = generation;
		if (gen === 0) return;
		if (!isKimiSubscription(ctx)) {
			cached = undefined;
			render(ctx);
			return;
		}
		const now = Date.now();
		if (!force && now - lastFetch < MIN_FETCH_GAP_MS) return;
		lastFetch = now;
		const token = resolveToken();
		if (!token) return; // keep showing the previous reading
		try {
			const usage = await fetchUsage(token);
			if (usage && gen === generation) cached = usage;
		} catch {
			// Network blip — keep the previous reading rather than blanking it.
		}
		if (gen === generation) render(ctx);
	}

	function start(ctx: ExtensionContext): void {
		stop();
		const gen = generation;
		void refresh(ctx, true);
		// Background poll so the reading moves while a long agent run is in flight.
		fetchTimer = setInterval(() => {
			if (gen === generation) void refresh(ctx);
		}, FETCH_INTERVAL_MS);
		// Cheap re-render so the reset countdown ticks over on the minute.
		renderTimer = setInterval(() => {
			if (gen === generation) render(ctx);
		}, RENDER_INTERVAL_MS);
	}

	function stop(): void {
		generation++;
		if (fetchTimer) clearInterval(fetchTimer);
		if (renderTimer) clearInterval(renderTimer);
		fetchTimer = undefined;
		renderTimer = undefined;
	}

	pi.on("session_start", (_event, ctx) => start(ctx));
	pi.on("model_select", (_event, ctx) => void refresh(ctx, true));
	pi.on("agent_settled", (_event, ctx) => void refresh(ctx, true));
	pi.on("session_shutdown", () => stop());
}
