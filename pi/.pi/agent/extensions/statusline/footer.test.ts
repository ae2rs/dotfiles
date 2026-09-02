import { describe, expect, mock, test } from "bun:test";

mock.module("@earendil-works/pi-tui", () => ({
	visibleWidth(text: string) {
		return text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "").length;
	},
	truncateToWidth(text: string, width: number) {
		return text.slice(0, Math.max(0, width));
	},
}));

const { installFooter } = await import("./footer.ts");

function renderFooter(width: number): string[] {
	let factory: ((tui: { requestRender(): void }, theme: { fg(_color: string, text: string): string }, footerData: unknown) => {
		render(width: number): string[];
		dispose(): void;
	}) | undefined;
	const ctx = {
		model: { id: "gpt-5.6-terra", provider: "openai-codex" },
		cwd: "/Users/test/project",
		getContextUsage: () => ({ percent: 42 }),
		sessionManager: { getBranch: () => [] },
		ui: {
			setFooter(value: typeof factory) {
				factory = value;
			},
		},
	};
	const pi = {
		getThinkingLevel: () => "high",
		on: () => {},
	};
	const usage = {
		getUsage: () => ({ kind: "mo" as const, remainingPct: 95, resetsAt: Date.UTC(2026, 9, 1) }),
		onChange: () => () => {},
	};
	installFooter(ctx as never, pi as never, usage);
	expect(factory).toBeDefined();
	const footer = factory!(
		{ requestRender() {} },
		{ fg: (_color: string, text: string) => text },
		{
			getExtensionStatuses: () => new Map(),
			getGitBranch: () => "main",
			onBranchChange: () => () => {},
		},
	);
	try {
		return footer.render(width);
	} finally {
		footer.dispose();
	}
}

describe("Codex monthly footer rendering", () => {
	test("shows the monthly allowance and reset date at normal width", () => {
		const lines = renderFooter(140);
		expect(lines).toHaveLength(2);
		expect(lines[0]).toContain("mo");
		expect(lines[0]).toContain("5%");
		expect(lines[0]).toContain("resets Oct 1");
	});

	test("fits cleanly at a narrow width", () => {
		const width = 36;
		const lines = renderFooter(width);
		expect(lines).toHaveLength(2);
		expect(lines.every((line) => line.length <= width)).toBe(true);
	});
});
