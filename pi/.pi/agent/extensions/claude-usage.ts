/**
 * claude-usage — footer status showing Claude subscription 5h-window headroom.
 *
 * The pi-claude bridge routes through the Claude Code subscription, whose
 * rate limits are per-account and invisible to pi's token accounting. This
 * extension polls Anthropic's OAuth usage endpoint (the same one Claude
 * Code's /usage uses) and shows the 5-hour window's remaining headroom in
 * the footer, e.g. `5h 72% left · resets 12:40`. Nothing is shown unless the
 * active model's provider is actually the bridged Claude subscription
 * ("pi-claude").
 *
 * Token sources, tried in order (contents never logged):
 *   1. CLAUDE_CODE_OAUTH_TOKEN env
 *   2. $CLAUDE_CONFIG_DIR/.credentials.json (claudeAiOauth.accessToken)
 *   3. macOS Keychain item "Claude Code-credentials" (where the claude CLI
 *      stores OAuth tokens on darwin; the bridge's spawned claude subprocess
 *      keeps it refreshed)
 *
 * Refresh cadence: a fresh fetch on session start, model select, and after
 * each agent run (throttled), plus a 5-minute background poll. The footer
 * text re-renders every minute so the reset countdown stays honest without
 * hammering the endpoint.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const PROVIDER_ID = "pi-claude";
const STATUS_KEY = "claude-usage";
const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const FETCH_INTERVAL_MS = 5 * 60 * 1000;
const MIN_FETCH_GAP_MS = 30 * 1000; // throttle event-driven fetches
const RENDER_INTERVAL_MS = 60 * 1000;
const EXPIRY_MARGIN_MS = 60 * 1000; // treat tokens expiring within a minute as expired

interface WindowUsage {
	utilization?: number;
	resets_at?: string | null;
}

interface UsageResponse {
	five_hour?: WindowUsage | null;
}

function readCredentialsFileToken(): string | undefined {
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

function readKeychainToken(): string | undefined {
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

function resolveToken(): string | undefined {
	const env = process.env.CLAUDE_CODE_OAUTH_TOKEN?.trim();
	if (env) return env;
	return readCredentialsFileToken() ?? readKeychainToken();
}

async function fetchFiveHour(token: string): Promise<WindowUsage | undefined> {
	const response = await fetch(USAGE_URL, {
		headers: {
			Authorization: `Bearer ${token}`,
			"anthropic-beta": "oauth-2025-04-20",
			"User-Agent": "claude-code/2.1.0",
		},
		signal: AbortSignal.timeout(10_000),
	});
	if (!response.ok) return undefined;
	const body = (await response.json()) as UsageResponse;
	return body.five_hour ?? undefined;
}

function formatResetTime(resetsAt: string | null | undefined): string | undefined {
	if (!resetsAt) return undefined;
	const ms = Date.parse(resetsAt);
	if (!Number.isFinite(ms)) return undefined;
	return new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export default function (pi: ExtensionAPI) {
	let cached: WindowUsage | undefined;
	let lastFetch = 0;
	let fetchTimer: ReturnType<typeof setInterval> | undefined;
	let renderTimer: ReturnType<typeof setInterval> | undefined;

	const isClaudeSubscription = (ctx: ExtensionContext): boolean => ctx.model?.provider === PROVIDER_ID;

	function render(ctx: ExtensionContext): void {
		if (!ctx.hasUI) return;
		if (!isClaudeSubscription(ctx) || !cached || typeof cached.utilization !== "number") {
			ctx.ui.setStatus(STATUS_KEY, undefined);
			return;
		}
		const remaining = Math.max(0, Math.round(100 - cached.utilization));
		const reset = formatResetTime(cached.resets_at);
		const text = `5h ${remaining}% left${reset ? ` · resets ${reset}` : ""}`;
		const color = remaining <= 10 ? "error" : remaining <= 30 ? "warning" : "muted";
		ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg(color as "muted", text));
	}

	async function refresh(ctx: ExtensionContext, force = false): Promise<void> {
		if (!isClaudeSubscription(ctx)) {
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
			const fiveHour = await fetchFiveHour(token);
			if (fiveHour) cached = fiveHour;
		} catch {
			// Network blip — keep the previous reading rather than blanking it.
		}
		render(ctx);
	}

	function start(ctx: ExtensionContext): void {
		stop();
		void refresh(ctx, true);
		// Background poll so the reading moves while a long agent run is in flight.
		fetchTimer = setInterval(() => void refresh(ctx), FETCH_INTERVAL_MS);
		// Cheap re-render so the reset countdown ticks over on the minute.
		renderTimer = setInterval(() => render(ctx), RENDER_INTERVAL_MS);
	}

	function stop(): void {
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
