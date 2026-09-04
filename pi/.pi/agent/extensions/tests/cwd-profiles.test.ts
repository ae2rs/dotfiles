import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Skill } from "@earendil-works/pi-coding-agent";
import { filterSkillsFromPrompt, loadProfileConfig, selectProfile } from "../cwd-profiles.ts";

const temporaryDirectories: string[] = [];

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { force: true, recursive: true });
});

function fixture(config: unknown): string {
	const directory = mkdtempSync(join(tmpdir(), "pi-cwd-profiles-"));
	temporaryDirectories.push(directory);
	const path = join(directory, "cwd-profiles.json");
	writeFileSync(path, JSON.stringify(config));
	return path;
}

function config(path: string) {
	return loadProfileConfig(path);
}

describe("cwd profile selection", () => {
	test("uses the default profile when no rule matches", () => {
		const profiles = config(
			fixture({
				base: { instructions: ["boundary.md"] },
				default: { instructions: ["default.md"], skills: ["default-skill"] },
				profiles: { monorepo: { skills: ["monorepo-skill"] } },
			}),
		);

		expect(selectProfile(profiles, "/work/other")).toMatchObject({
			name: "default",
			skills: [expect.stringContaining("default-skill")],
			instructions: [expect.stringContaining("boundary.md"), expect.stringContaining("default.md")],
		});
	});

	test("uses the most specific matching directory rule", () => {
		const profiles = config(
			fixture({
				default: {},
				profiles: {
					work: { skills: ["work-skill"] },
					monorepo: { skills: ["monorepo-skill"] },
				},
				directoryRules: [
					{ directory: "/work", profile: "work" },
					{ directory: "/work/monorepo", profile: "monorepo" },
				],
			}),
		);

		expect(selectProfile(profiles, "/work/monorepo/rs/engine")).toMatchObject({
			name: "monorepo",
			skills: [expect.stringContaining("monorepo-skill")],
		});
	});

	test("uses an origin rule when no directory rule matches", () => {
		const profiles = config(
			fixture({
				default: {},
				profiles: { monorepo: { skills: ["monorepo-skill"] } },
				originRules: [{ origin: "wesprint-io/monorepo", profile: "monorepo" }],
			}),
		);

		expect(selectProfile(profiles, "/tmp/worktree", "wesprint-io/monorepo")).toMatchObject({
			name: "monorepo",
			skills: [expect.stringContaining("monorepo-skill")],
		});
	});

	test("falls back to an empty default profile when configuration is malformed", () => {
		const path = fixture("not json");
		writeFileSync(path, "not json");

		expect(selectProfile(loadProfileConfig(path), "/work/other")).toEqual({
			name: "default",
			instructions: [],
			skills: [],
		});
	});

	test("removes discovered skills that are not in the selected profile", () => {
		const prompt = `base\n\nThe following skills provide specialized instructions for specific tasks.\n<available_skills>\n  <skill><name>selected</name></skill>\n  <skill><name>other</name></skill>\n</available_skills>\nend`;
		const skills = [
			{ name: "selected", description: "", filePath: "/profiles/selected/SKILL.md" },
			{ name: "other", description: "", filePath: "/profiles/other/SKILL.md" },
		] as unknown as Skill[];
		const format = (available: Skill[]) => available.map((skill) => `<name>${skill.name}</name>`).join("\n");

		expect(filterSkillsFromPrompt(prompt, skills, ["/profiles/selected"], "read", format)).toContain("<name>selected</name>");
		expect(filterSkillsFromPrompt(prompt, skills, ["/profiles/selected"], "read", format)).not.toContain("<name>other</name>");
	});
});
