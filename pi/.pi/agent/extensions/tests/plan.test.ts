import { describe, expect, test } from "bun:test";
import { resolvePlanFile } from "../plan.ts";

describe("plan file resolution", () => {
	test("uses the git worktree root for the default plan", () => {
		expect(resolvePlanFile("/worktree/project/src", undefined, "/worktree/project")).toBe("/worktree/project/PLAN.md");
	});

	test("falls back to cwd outside a git repository", () => {
		expect(resolvePlanFile("/tmp/scratch")).toBe("/tmp/scratch/PLAN.md");
	});

	test("keeps explicit paths relative to cwd", () => {
		expect(resolvePlanFile("/worktree/project/src", "plans/task.md", "/worktree/project")).toBe(
			"/worktree/project/src/plans/task.md",
		);
	});
});
