---
description: Survey an unfamiliar codebase and record what routine work would not teach
argument-hint: "[path or area]"
---
Build a working understanding of ${1:-this repository}.

## Survey

Work outside-in, and stop once the picture is coherent. Do **not** read every source file —
on a large repo that burns the context window and buys little.

1. Orient from the cheap signals first: README, the build/package manifest, lockfiles, CI
   config, `AGENTS.md` / `CLAUDE.md`, and the directory layout two levels deep.
2. Identify the entry points and follow one representative path end to end.
3. Infer conventions from what the code does, not from what the docs claim: naming, error
   handling, test layout and style, how modules are wired together.
4. Note the commands that matter — build, test, lint, run — and where they are defined.

Delegate broad searching to a subagent rather than filling this session with raw file
contents. If two or three searches have not answered a question, hand it off.

## Report

Summarise concisely: what this project is, how it is laid out, the conventions worth
following, the commands to run, and anything sharp-edged. Flag what you are unsure about
rather than smoothing over it.

## Record — sparingly

Memory here is `pi-hermes-memory`, which already reviews the conversation every 10 turns or
15 tool calls and saves what it judges durable. Routine work therefore accumulates memory on
its own. Your job is only the part that automatic capture will *not* reach: the structural
understanding that comes from a deliberate orientation pass rather than from touching files.

The project store holds roughly **5000 characters in total**, shared with everything saved
later. Treat it as a budget, not a dumping ground.

So save **at most 3–5 entries**, each earning its place:

- Call the `memory_add` tool explicitly — saying something has been remembered writes
  nothing, and a claim of success is not evidence of one.
- `target: "project"`. Omit `category`; it is meant for failure memories.
- One self-contained fact per entry, useful with no other context.
- Check `memory_search` first and use `memory_replace` rather than adding a near-duplicate.

Good candidates: module boundaries and why they sit where they do, a convention that is
easy to violate, a build or test invocation that is not guessable, a known sharp edge.

Do not save: current branch or work-in-progress state, line numbers, anything restated from
a README the agent will read anyway, or anything you inferred but did not verify.

Finish by listing back exactly which entries you wrote, so I can see what the budget went on.
