# Hashline benchmark

`run.ts` runs checker-backed Pi edit tasks in isolated directories under
`/tmp/hl-bench/runs`. It needs the Bun-backed `~/.local/bin/pi` wrapper and the
configured model providers.

```sh
cd ~/.pi/agent/extensions/hashline-edit/bench
bun run.ts                 # replace vs hashline
bun run.ts prompts         # full vs compact hashline prompt
```

The harness sets its own `PI_EDIT_MODE` and `PI_EDIT_PROMPT` per run, streams
Pi's JSON events, and records checker result, failed edit calls, output tokens,
and wall time. Raw results from the initial measurement are checked in beside
it.

## Results

### Replace vs hashline

| model | mode | pass | failed edits | average output tokens |
| --- | --- | --- | --- | --- |
| kimi-coding/k3 | replace | 11/12 | 0/10 | 232 |
| kimi-coding/k3 | hashline | 12/12 | 0/10 | 197 |
| pi-claude/claude-opus-5 | replace | 6/6 | 0/5 | 305 |
| pi-claude/claude-opus-5 | hashline | 6/6 | 0/5 | 198 |

The hashline runs emitted 15% fewer output tokens on k3 and 35% fewer on
Opus. Five operator-swap runs used `write` rather than `edit`; their successful
checker results count toward pass rate but not edit-call metrics.

### Full vs compact hashline prompt (k3)

| prompt | pass | failed edits | median output tokens |
| --- | --- | --- | --- |
| full | 16/16 | 0/16 | 175 |
| compact | 16/16 | 0/17 | 182 |

This includes multi-hunk and cross-file-move/register tasks. No behavioral
regression was detected, but the full prompt remains the default: its extra
guardrails target rare long-session failure modes not represented by this small
synthetic suite. Set `PI_EDIT_PROMPT=compact` to opt into the roughly 60%
smaller prompt description and rerun this harness when real-world evidence
justifies making it the default.
