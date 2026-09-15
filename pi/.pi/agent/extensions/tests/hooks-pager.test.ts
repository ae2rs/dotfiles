import { describe, expect, test } from "bun:test";
import { clampScroll, flatten, maxScroll, toLines } from "../hooks/pager.ts";

const ESC = "\u001b";

describe("flatten", () => {
	test("strips colours, hyperlinks and cursor movement", () => {
		expect(flatten(`${ESC}[31merror${ESC}[0m`)).toBe("error");
		expect(flatten(`${ESC}]8;;https://pi.dev${ESC}\\link${ESC}]8;;${ESC}\\`)).toBe("link");
		expect(flatten(`done${ESC}[2K${ESC}[1A`)).toBe("done");
	});

	test("keeps only the last frame of a progress bar", () => {
		expect(flatten("10%\r50%\r100%")).toBe("100%");
		expect(flatten("Building\r")).toBe("Building");
	});

	test("expands tabs and drops stray control characters", () => {
		expect(flatten("a\tb")).toBe("a    b");
		expect(flatten("bel\u0007\u0000")).toBe("bel");
	});
});

describe("toLines", () => {
	test("splits interleaved segments on newlines", () => {
		expect(toLines([{ err: false, text: "one\ntwo\n" }])).toEqual([
			{ text: "one", err: false },
			{ text: "two", err: false },
		]);
	});

	test("joins a line split across chunk boundaries", () => {
		expect(
			toLines([
				{ err: false, text: "half" },
				{ err: false, text: "way\n" },
			]),
		).toEqual([{ text: "halfway", err: false }]);
	});

	test("marks a line as stderr when any of its output came from stderr", () => {
		expect(
			toLines([
				{ err: false, text: "warning: " },
				{ err: true, text: "unused\n" },
				{ err: false, text: "ok\n" },
			]),
		).toEqual([
			{ text: "warning: unused", err: true },
			{ text: "ok", err: false },
		]);
	});

	test("keeps a trailing line that has no newline yet", () => {
		expect(toLines([{ err: false, text: "in progress" }])).toEqual([
			{ text: "in progress", err: false },
		]);
	});
});

describe("scroll bounds", () => {
	test("stops at the last full screen", () => {
		expect(maxScroll(100, 20)).toBe(80);
		expect(clampScroll(999, 100, 20)).toBe(80);
		expect(clampScroll(-5, 100, 20)).toBe(0);
	});

	test("pins to the top when the content fits", () => {
		expect(maxScroll(3, 20)).toBe(0);
		expect(clampScroll(999, 3, 20)).toBe(0);
	});
});
