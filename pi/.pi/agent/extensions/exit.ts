/**
 * /exit — graceful shutdown from the editor.
 *
 * ctx.shutdown() defers until the agent is idle, so queued steering and follow-up
 * messages finish first, and it emits session_shutdown to every extension before
 * the process ends. That matters with pi-hermes-memory loaded: killing the process
 * mid-run can drop whatever it was about to persist.
 *
 * Only /exit is registered. /quit is in Pi's BUILTIN_SLASH_COMMANDS, so an
 * extension command of that name is always shadowed by the built-in — which tears
 * down immediately rather than waiting for idle.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  const shutdown = async (_args: string, ctx: { ui: { notify: (m: string, l: string) => void }; isIdle: () => boolean; shutdown: () => void }) => {
    ctx.ui.notify(ctx.isIdle() ? "Exiting…" : "Exiting once the current run finishes…", "info");
    ctx.shutdown();
  };

  pi.registerCommand("exit", {
    description: "Exit Pi cleanly once the agent is idle",
    handler: shutdown,
  });
}
