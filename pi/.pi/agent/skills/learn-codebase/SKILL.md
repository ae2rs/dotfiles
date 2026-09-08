---
name: learn-codebase
description: Build a working understanding of an unfamiliar repository — survey it outside-in from cheap signals, verify the claims that matter, report the picture, and seed the persistent memory store with the durable facts. Use when starting work in a repo you have no memory of, or when asked to learn, survey, or onboard onto a codebase.
---

# Learn a codebase

Two outputs: a report the user reads now, and a small set of memories that make the next
session cheaper. Neither is worth much without the other.

## Check memory first

Before reading any source, find out what is already known:

1. `memory_tags` — the existing vocabulary, so this pass extends it instead of forking it.
2. `memory_search` with the project scope — what previous sessions established.

If the search returns nothing, this is a first pass and everything below is new ground.
If it returns entries, treat them as claims from an older version of the repo: they say
what was true when written. Verify anything you are about to rely on, and
`memory_update` what has drifted.

## Survey

Work outside-in and stop once the picture is coherent. Do **not** read every source file —
on a large repo that burns the context window and buys little.

1. Orient from the cheap signals: README, the build/package manifest, lockfiles, CI config,
   `AGENTS.md` / `CLAUDE.md`, and the directory layout two levels deep.
2. Identify the entry points and follow one representative path end to end.
3. Infer conventions from what the code does, not what the docs claim: naming, error
   handling, test layout and style, how modules are wired together.
4. Note the commands that matter — build, test, lint, run — and where they are defined.

Delegate broad searching to a subagent rather than filling this session with raw file
contents. If two or three searches have not answered a question, hand it off.

Run the build and test commands rather than transcribing them from the README. A command
that does not work is worse than no command, and it is the kind of thing that rots first.

## Report

Summarise concisely: what this project is, how it is laid out, the conventions worth
following, the commands to run, and anything sharp-edged. Flag what you are unsure about
rather than smoothing over it.

## Record

Nothing is captured automatically. A memory exists only if you called `memory_save`, and
saying you have remembered something writes nothing.

**Scope is the trap.** `memory_save` defaults to `scope: "global"`, which puts a
project-specific fact in front of every future session in every repo. Pass the project
scope name explicitly — it is printed in the `<memory-store>` block as
`current project scope: <name>`.

For each entry:

- One self-contained fact, useful to someone who has not read this report.
- `memory_search` first; prefer `memory_update` on a near-duplicate over a second entry.
- `type`: `fact` for how the repo is; `decision` for a choice and the rationale behind it;
  `failure` for an approach that does not work here and the reason. `preference` is for the
  user, not the repo — a survey rarely produces one.
- `tags`: reuse what `memory_tags` already returned. Every distinct tag is listed in the
  system prompt census, so inventing a synonym costs context in every later session.

Worth saving: module boundaries and why they sit where they do; a convention that is easy
to violate and not enforced by tooling; a build or test invocation that is not guessable;
a sharp edge you hit and worked around.

Not worth saving: the current branch or work-in-progress state; line numbers; anything
restated from a README the agent will read anyway; anything you inferred but did not
verify. Volume is not the goal — the store is unbounded, but a search that returns twenty
vague entries is worse than one that returns three sharp ones.

Finish by listing back exactly which entries you wrote and under which scope, so the user
can see what landed.
