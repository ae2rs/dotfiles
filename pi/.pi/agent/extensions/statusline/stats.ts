/**
 * stats — per-message usage stats after each assistant reply.
 *
 * Appends a `usage-stats` custom entry (input/output tokens + duration, no
 * cost) on every assistant message_end and renders it as a dim one-liner
 * under the reply: ` ↑1.2k ↓3.4k · 4.1s`. Custom entries never enter the
 * LLM context, so this is display-only.
 */
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

const CUSTOM_TYPE = "usage-stats";

interface UsageStatsData {
	input: number;
	output: number;
	durationMs?: number;
}

export function formatTokens(count: number): string {
	if (count < 1000) return `${count}`;
	if (count < 10_000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1_000_000) return `${Math.round(count / 1000)}k`;
	return `${(count / 1_000_000).toFixed(1)}M`;
}

function formatDuration(ms: number): string {
	if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
	const minutes = Math.floor(ms / 60_000);
	const seconds = Math.floor((ms % 60_000) / 1000);
	return `${minutes}m ${seconds}s`;
}

export function setupStats(pi: ExtensionAPI): void {
	let messageStartAt = 0;

	pi.on("message_start", (event) => {
		if (event.message.role === "assistant") {
			messageStartAt = Date.now();
		}
	});

	pi.on("message_end", (event) => {
		const message = event.message;
		if (message.role !== "assistant") return;
		const usage = (message as AssistantMessage).usage;
		if (!usage) return;
		const data: UsageStatsData = { input: usage.input ?? 0, output: usage.output ?? 0 };
		if (messageStartAt) {
			data.durationMs = Date.now() - messageStartAt;
			messageStartAt = 0;
		}
		pi.appendEntry(CUSTOM_TYPE, data);
	});

	pi.registerEntryRenderer<UsageStatsData>(CUSTOM_TYPE, (entry, _options, theme) => {
		const data = entry.data;
		if (!data) return undefined;
		const parts = [`↑${formatTokens(data.input)}`, `↓${formatTokens(data.output)}`];
		if (typeof data.durationMs === "number") {
			parts.push(`· ${formatDuration(data.durationMs)}`);
		}
		return new Text(theme.fg("dim", ` ${parts.join(" ")}`), 0, 0);
	});
}
