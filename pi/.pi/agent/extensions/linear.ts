/**
 * linear — expose the /linear command and the `linear` skill only inside the
 * work repos and their worktrees.
 *
 * Availability is gated by the current directory's git `origin` remote. Every
 * worktree shares its parent repo's remote, so ad-hoc/temporary worktrees are
 * covered too, while personal repos (dotfiles, etc.) never see the command or
 * the skill — not even its description in the system prompt.
 *
 * The resource files live in ../linear/, outside Pi's auto-scanned prompts/ and
 * skills/ directories, so they are reachable ONLY through the resources_discover
 * hook below. If this extension fails to load, /linear is simply absent
 * everywhere (fail-closed).
 */
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const WORK_REPOS = new Set(["wesprint-io/monorepo", "wesprint-io/infrastructure"]);

const here = dirname(fileURLToPath(import.meta.url));
const PROMPT_PATH = join(here, "..", "linear", "prompts", "linear.md");
const SKILL_PATH = join(here, "..", "linear", "skills", "linear", "SKILL.md");

/** GitHub owner/name of cwd's origin remote, or undefined outside a git repo. */
function originSlug(cwd: string): string | undefined {
	try {
		const url = execFileSync("git", ["-C", cwd, "remote", "get-url", "origin"], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
		return url.replace(/^(git@github\.com:|https:\/\/github\.com\/)/, "").replace(/\.git$/, "");
	} catch {
		return undefined;
	}
}

export default function (pi: ExtensionAPI) {
	pi.on("resources_discover", (event) => {
		const slug = originSlug(event.cwd);
		if (slug === undefined || !WORK_REPOS.has(slug)) return {};
		return { promptPaths: [PROMPT_PATH], skillPaths: [SKILL_PATH] };
	});
}
