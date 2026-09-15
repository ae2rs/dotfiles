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

function renderFooter(width: number, statuses: Map<string, string> = new Map()): string[] {
	let factory:
		| ((
				tui: { requestRender(): void },
				theme: { fg(_color: string, text: string): string },
				footerData: unknown,
		  ) => {
				render(width: number): string[];
				dispose(): void;
		  })
		| undefined;
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
			getExtensionStatuses: () => statuses,
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

describe("hooks status placement", () => {
	const statuses = new Map([
		["hooks", "󰘯 2 hooks, 1 detached"],
		["other-ext", "unrelated"],
	]);

	test("sits on line 1 after the model and thinking level", () => {
		const [line1] = renderFooter(140, statuses);
		expect(line1).toContain("gpt-5.6-terra");
		expect(line1).toContain("󰘯 2 hooks, 1 detached");
		expect(line1.indexOf("high")).toBeGreaterThan(line1.indexOf("gpt-5.6-terra"));
		expect(line1.indexOf("󰘯")).toBeGreaterThan(line1.indexOf("high"));
	});

	test("is separated from its neighbour by a dot", () => {
		const [line1] = renderFooter(140, statuses);
		expect(line1).toContain("· 󰘯 2 hooks, 1 detached");
	});

	test("is not repeated on line 2, which keeps other extension statuses", () => {
		const [, line2] = renderFooter(140, statuses);
		expect(line2).not.toContain("hooks");
		expect(line2).toContain("unrelated");
	});

	test("leaves line 1 unchanged when no hook is running", () => {
		const [line1] = renderFooter(140, new Map([["other-ext", "unrelated"]]));
		expect(line1).toBe(renderFooter(140)[0]);
	});
});
