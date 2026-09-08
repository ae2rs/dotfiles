import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { planFileFor, SessionPlanStore } from "../plan/store.ts";

const noQueue = async <T>(_file: string, operation: () => Promise<T>): Promise<T> => operation();

describe("session plan storage", () => {
	test("keeps each session plan outside the working tree", () => {
		expect(planFileFor("session-a", "/Users/me/.pi/agent")).toBe(
			"/Users/me/.pi/agent/plans/session-a.md",
		);
	});

	test("gives each session an independent plan document", () => {
		const agentDir = "/tmp/pi-agent";
		expect(planFileFor("session-a", agentDir)).not.toBe(planFileFor("session-b", agentDir));
	});

	test("writes and exactly edits the session plan", async () => {
		const agentDir = await mkdtemp(join(tmpdir(), "pi-plan-test-"));
		try {
			const store = new SessionPlanStore(planFileFor("session-a", agentDir), noQueue);
			await store.write("# Plan\n\n1. Inspect\n");
			await store.edit("1. Inspect", "1. Implement");
			expect(await store.read()).toBe("# Plan\n\n1. Implement\n");
		} finally {
			await rm(agentDir, { recursive: true, force: true });
		}
	});
});
