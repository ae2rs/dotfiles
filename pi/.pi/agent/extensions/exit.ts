/**
 * /exit and /quit — graceful shutdown from the editor.
 *
 * ctx.shutdown() defers until the agent is idle, so queued steering and follow-up
 * messages finish first, and it emits session_shutdown to every extension before
 * the process ends. That matters with pi-hermes-memory loaded: killing the process
 * mid-run can drop whatever it was about to persist.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  const shutdown = async (_args: string, ctx: { ui: { notify: (m: string, l: string) => void }; isIdle: () => boolean; shutdown: () => void }) => {
    ctx.ui.notify(ctx.isIdle() ? "Exiting…" : "Exiting once the current run finishes…", "info");
    ctx.shutdown();
  };

  for (const name of ["exit", "quit"]) {
    pi.registerCommand(name, {
      description: "Exit Pi cleanly once the agent is idle",
      handler: shutdown,
    });
  }
}
