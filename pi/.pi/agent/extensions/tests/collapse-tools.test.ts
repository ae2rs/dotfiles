import { describe, expect, test } from "bun:test";
import {
	commandPreview,
	diffStats,
	formatStats,
	formatSummary,
	relativePath,
	writeStats,
} from "../collapse-tools/format.ts";

describe("formatSummary", () => {
	test("single tool, single call", () => {
		expect(formatSummary(new Map([["read", 1]]))).toBe("read");
	});

	test("repeated tool gets a count", () => {
		expect(formatSummary(new Map([["read", 2]]))).toBe("read ×2");
	});

	test("multiple tools keep first-seen order", () => {
		const counts = new Map([
			["grep", 1],
			["read", 3],
			["ls", 2],
		]);
		expect(formatSummary(counts)).toBe("grep · read ×3 · ls ×2");
	});
});

describe("commandPreview", () => {
	test("single line passes through", () => {
		expect(commandPreview("npm test")).toBe("npm test");
	});
	test("skips leading blank lines and takes the first meaningful line", () => {
		expect(commandPreview("\n\n  ls -la \n echo hi")).toBe("ls -la");
	});
	test("truncates long commands", () => {
		expect(commandPreview("x".repeat(200))).toBe(`${"x".repeat(120)}…`);
	});
	test("empty command", () => {
		expect(commandPreview("")).toBe("");
	});
});

describe("diffStats", () => {
	test("counts +/- lines and ignores file headers", () => {
		const diff = "--- a/f.ts\n+++ b/f.ts\n@@ -1,2 +1,3 @@\n context\n-old\n+new\n+added\n";
		expect(diffStats(diff)).toEqual({ added: 2, removed: 1 });
	});

	test("empty diff", () => {
		expect(diffStats("")).toEqual({ added: 0, removed: 0 });
	});
});

describe("writeStats", () => {
	test("counts content lines as additions", () => {
		expect(writeStats("a\nb\nc")).toEqual({ added: 3, removed: 0 });
		expect(writeStats("a\n")).toEqual({ added: 2, removed: 0 });
		expect(writeStats("")).toEqual({ added: 0, removed: 0 });
	});
});

describe("formatStats", () => {
	test("both sides", () => {
		expect(formatStats({ added: 12, removed: 3 })).toBe("(+12 −3)");
	});

	test("omits zero sides", () => {
		expect(formatStats({ added: 5, removed: 0 })).toBe("(+5)");
		expect(formatStats({ added: 0, removed: 2 })).toBe("(−2)");
		expect(formatStats({ added: 0, removed: 0 })).toBe("");
		expect(formatStats(undefined)).toBe("");
	});
});

describe("relativePath", () => {
	test("strips the cwd prefix", () => {
		expect(relativePath("/repo", "/repo/src/f.ts")).toBe("src/f.ts");
	});

	test("leaves other paths untouched", () => {
		expect(relativePath("/repo", "/other/f.ts")).toBe("/other/f.ts");
		expect(relativePath("/repo", "/report/f.ts")).toBe("/report/f.ts");
		expect(relativePath("/repo", "src/f.ts")).toBe("src/f.ts");
	});
});
