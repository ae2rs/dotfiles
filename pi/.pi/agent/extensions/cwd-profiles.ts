import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, Skill } from "@earendil-works/pi-coding-agent";

type Profile = {
	instructions: string[];
	skills: string[];
};

type DirectoryRule = {
	directory: string;
	profile: string;
};

type OriginRule = {
	origin: string;
	profile: string;
};

type ProfileConfig = {
	base: Profile;
	default: Profile;
	profiles: Map<string, Profile>;
	directoryRules: DirectoryRule[];
	originRules: OriginRule[];
	configDir: string;
};

export type SelectedProfile = {
	name: string;
	instructions: string[];
	skills: string[];
};

const agentDir = dirname(dirname(fileURLToPath(import.meta.url)));
const configPath = join(agentDir, "cwd-profiles.json");

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringList(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function profile(value: unknown): Profile {
	if (!isRecord(value)) return { instructions: [], skills: [] };
	return {
		instructions: stringList(value.instructions),
		skills: stringList(value.skills),
	};
}

function resolveResource(configDir: string, resource: string): string {
	return isAbsolute(resource) ? resolve(resource) : resolve(configDir, resource);
}

function knownProfile(config: ProfileConfig, name: string): boolean {
	return name === "default" || config.profiles.has(name);
}

function uniquePaths(paths: string[]): string[] {
	return [...new Set(paths)];
}

export function loadProfileConfig(path: string): ProfileConfig {
	const configDir = dirname(path);
	const fallback: ProfileConfig = {
		base: { instructions: [], skills: [] },
		default: { instructions: [], skills: [] },
		profiles: new Map(),
		directoryRules: [],
		originRules: [],
		configDir,
	};

	try {
		const value: unknown = JSON.parse(readFileSync(path, "utf8"));
		if (!isRecord(value)) throw new Error("top level must be an object");

		const profiles = new Map<string, Profile>();
		if (isRecord(value.profiles)) {
			for (const [name, entry] of Object.entries(value.profiles)) {
				profiles.set(name, profile(entry));
			}
		}

		const config: ProfileConfig = {
			...fallback,
			base: profile(value.base),
			default: profile(value.default),
			profiles,
		};

		config.directoryRules = Array.isArray(value.directoryRules)
			? value.directoryRules.flatMap((entry) => {
				if (!isRecord(entry) || typeof entry.directory !== "string" || typeof entry.profile !== "string") return [];
				if (!knownProfile(config, entry.profile)) return [];
				return [{ directory: resolveResource(configDir, entry.directory), profile: entry.profile }];
			})
			: [];
		config.originRules = Array.isArray(value.originRules)
			? value.originRules.flatMap((entry) => {
				if (!isRecord(entry) || typeof entry.origin !== "string" || typeof entry.profile !== "string") return [];
				if (!knownProfile(config, entry.profile)) return [];
				return [{ origin: entry.origin, profile: entry.profile }];
			})
			: [];
		return config;
	} catch (error) {
		console.warn(`cwd-profiles: could not load ${path}: ${error instanceof Error ? error.message : error}`);
		return fallback;
	}
}

function matchesDirectory(cwd: string, directory: string): boolean {
	return cwd === directory || cwd.startsWith(`${directory}${sep}`);
}

function profileByName(config: ProfileConfig, name: string): Profile {
	return name === "default" ? config.default : (config.profiles.get(name) ?? config.default);
}

export function selectProfile(config: ProfileConfig, cwd: string, origin?: string): SelectedProfile {
	const resolvedCwd = resolve(cwd);
	const directoryMatch = config.directoryRules
		.filter((rule) => matchesDirectory(resolvedCwd, rule.directory))
		.sort((left, right) => right.directory.length - left.directory.length)[0];
	const originMatch = directoryMatch === undefined ? config.originRules.find((rule) => rule.origin === origin) : undefined;
	const name = directoryMatch?.profile ?? originMatch?.profile ?? "default";
	const selected = profileByName(config, name);

	return {
		name,
		instructions: uniquePaths(
			[...config.base.instructions, ...selected.instructions].map((entry) => resolveResource(config.configDir, entry)),
		),
		skills: uniquePaths([...selected.skills].map((entry) => resolveResource(config.configDir, entry))),
	};
}

export function originSlug(cwd: string): string | undefined {
	try {
		const origin = execFileSync("git", ["-C", cwd, "remote", "get-url", "origin"], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
			timeout: 2_000,
		}).trim();
		return origin.replace(/^(git@github\.com:|https:\/\/github\.com\/)/, "").replace(/\.git$/, "");
	} catch {
		return undefined;
	}
}

function loadInstructions(paths: string[]): Array<{ path: string; content: string }> {
	return paths.flatMap((path) => {
		if (!existsSync(path)) {
			console.warn(`cwd-profiles: configured instruction file does not exist: ${path}`);
			return [];
		}
		try {
			return [{ path, content: readFileSync(path, "utf8") }];
		} catch (error) {
			console.warn(`cwd-profiles: could not read ${path}: ${error instanceof Error ? error.message : error}`);
			return [];
		}
	});
}

function isConfiguredSkill(skillPath: string, configuredPaths: string[]): boolean {
	return configuredPaths.some((configuredPath) => {
		if (skillPath === configuredPath) return true;
		const prefix = configuredPath.endsWith(sep) ? configuredPath : `${configuredPath}${sep}`;
		return skillPath.startsWith(prefix);
	});
}

export function filterSkillsFromPrompt(
	systemPrompt: string,
	skills: Skill[],
	configuredPaths: string[],
	fileReadTool: "read" | "bash" | undefined,
	formatSkills: (skills: Skill[], fileReadTool: "read" | "bash") => string,
): string {
	const start = systemPrompt.indexOf("\n\nThe following skills provide specialized instructions for specific tasks.");
	if (start === -1) return systemPrompt;
	const end = systemPrompt.indexOf("</available_skills>", start);
	if (end === -1) return systemPrompt;

	const replacement = fileReadTool === undefined
		? ""
		: formatSkills(skills.filter((skill) => isConfiguredSkill(skill.filePath, configuredPaths)), fileReadTool);
	return systemPrompt.slice(0, start) + replacement + systemPrompt.slice(end + "</available_skills>".length);
}

function formatInstructions(name: string, instructions: Array<{ path: string; content: string }>): string | undefined {
	if (instructions.length === 0) return undefined;
	return `\n\n<pi_profile name="${name}">\n\nPi-owned instructions:\n\n${instructions
		.map(({ path, content }) => `<instructions path="${path}">\n${content}\n</instructions>`)
		.join("\n\n")}\n\n</pi_profile>`;
}

export default async function (pi: ExtensionAPI): Promise<void> {
	const { formatSkillsForPrompt } = await import("@earendil-works/pi-coding-agent");
	let selected: SelectedProfile | undefined;

	pi.on("resources_discover", (event) => {
		selected = selectProfile(loadProfileConfig(configPath), event.cwd, originSlug(event.cwd));
		return { skillPaths: selected.skills };
	});

	pi.on("before_agent_start", (event) => {
		const active = selected ?? selectProfile(loadProfileConfig(configPath), event.systemPromptOptions.cwd, originSlug(event.systemPromptOptions.cwd));
		const fileReadTool = event.systemPromptOptions.selectedTools?.includes("read")
			? "read"
			: event.systemPromptOptions.selectedTools?.includes("bash")
				? "bash"
				: undefined;
		const systemPrompt = filterSkillsFromPrompt(
			event.systemPrompt,
			event.systemPromptOptions.skills ?? [],
			active.skills,
			fileReadTool,
			formatSkillsForPrompt,
		);
		const instructions = formatInstructions(active.name, loadInstructions(active.instructions));
		return instructions === undefined ? { systemPrompt } : { systemPrompt: systemPrompt + instructions };
	});
}
