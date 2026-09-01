/**
 * claude-mem context injection for Pi.
 *
 * Reuses the memory store Claude Code already writes to (~/.claude-mem). Pi talks
 * to it through claude-mem's platform-adapter CLI: JSON on stdin, JSON on stdout.
 * The `raw` adapter accepts any payload with a valid `cwd`, so no fork or patch of
 * claude-mem is needed.
 *
 * Read-only by design. Observation *generation* is driven by claude-mem's
 * transcript watcher, which parses Claude Code's JSONL schema; Pi's session format
 * is unrelated, so Pi contributes no observations. Claude Code remains the writer.
 * Search over the same store is provided separately by mcp.json + pi-mcp-adapter.
 */
import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const HOOK_TIMEOUT_MS = 20_000;

/**
 * Newest non-orphaned plugin release, mirroring how claude-mem's own hooks resolve
 * themselves. Version directories are semver-sorted; a `.orphaned_at` marker means
 * the release was superseded and must be skipped even when it sorts highest.
 */
function findClaudeMemRoot(): string | undefined {
  const configDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
  const cache = join(configDir, "plugins", "cache", "thedotmack", "claude-mem");

  let entries: string[];
  try {
    entries = readdirSync(cache);
  } catch {
    return undefined;
  }

  const candidates = entries
    .filter((name) => /^\d/.test(name))
    .filter((name) => !existsSync(join(cache, name, ".orphaned_at")))
    .map((name) => ({ name, parts: name.split(/[.-]/).map((p) => parseInt(p, 10) || 0) }))
    .sort((a, b) => b.parts[0] - a.parts[0] || b.parts[1] - a.parts[1] || b.parts[2] - a.parts[2]);

  for (const { name } of candidates) {
    const root = join(cache, name);
    if (existsSync(join(root, "scripts", "worker-service.cjs"))) return root;
  }
  return undefined;
}

function runWorker(root: string, args: string[], input?: unknown): Promise<any> {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [join(root, "scripts", "bun-runner.js"), join(root, "scripts", "worker-service.cjs"), ...args],
      { stdio: ["pipe", "pipe", "ignore"] },
    );

    const timer = setTimeout(() => child.kill(), HOOK_TIMEOUT_MS);
    let out = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.on("error", () => { clearTimeout(timer); resolve(undefined); });
    child.on("close", () => {
      clearTimeout(timer);
      // bun-runner can emit non-JSON noise; the result is the last JSON line.
      for (const line of out.trim().split("\n").reverse()) {
        try { return resolve(JSON.parse(line)); } catch { /* keep looking */ }
      }
      resolve(undefined);
    });

    child.stdin.end(input === undefined ? "" : JSON.stringify(input));
  });
}

export default function (pi: ExtensionAPI) {
  const root = findClaudeMemRoot();
  let injected = false;

  pi.on("before_agent_start", async (_event, ctx) => {
    if (injected || !root) return;
    injected = true; // one shot per session, and never retry a failure

    // Normally started by Claude Code's SessionStart hook; a no-op when already up.
    // Deliberately not `hook raw session-init` — that registers an sdk_sessions row
    // which stays empty forever, since Pi never generates observations against it.
    await runWorker(root, ["start"]);

    const result = await runWorker(root, ["hook", "raw", "context"], { cwd: ctx.cwd });
    const content = result?.hookSpecificOutput?.additionalContext;
    if (!content) return;

    return {
      message: {
        customType: "claude-mem",
        content,
        display: true,
      },
    };
  });
}
