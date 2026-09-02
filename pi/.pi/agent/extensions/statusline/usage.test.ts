import { describe, expect, test } from "bun:test";
import { parseCodexUsage } from "./usage.ts";

describe("parseCodexUsage", () => {
	test("maps a monthly allowance and prefers its absolute reset", () => {
		expect(
			parseCodexUsage(
				{
					spend_control: {
						individual_limit: {
							remaining_percent: 94.6,
							reset_at: 1_790_812_800,
							reset_after_seconds: 60,
						},
					},
				},
				0,
			),
		).toEqual({ kind: "mo", remainingPct: 95, resetsAt: 1_790_812_800_000 });
	});

	test("falls back to reset_after_seconds", () => {
		expect(
			parseCodexUsage(
				{ spend_control: { individual_limit: { remaining_percent: 50, reset_after_seconds: 90 } } },
				1_000,
			),
		).toEqual({ kind: "mo", remainingPct: 50, resetsAt: 91_000 });
	});

	test("clamps remaining percentage", () => {
		expect(
			parseCodexUsage({ spend_control: { individual_limit: { remaining_percent: 120 } } }),
		).toMatchObject({ kind: "mo", remainingPct: 100 });
		expect(
			parseCodexUsage({ spend_control: { individual_limit: { remaining_percent: -2 } } }),
		).toMatchObject({ kind: "mo", remainingPct: 0 });
	});

	test("rejects missing and malformed allowances", () => {
		expect(parseCodexUsage(undefined)).toBeUndefined();
		expect(parseCodexUsage({ spend_control: { individual_limit: { remaining_percent: "nope" } } })).toBeUndefined();
		expect(parseCodexUsage({ spend_control: { individual_limit: { remaining_percent: null } } })).toBeUndefined();
	});
});
