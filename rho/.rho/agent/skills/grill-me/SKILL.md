---
name: grill-me
description: Stress-test a plan or design by questioning the user until every decision in it is settled — facts looked up, decisions put to the user through questionnaire with a recommended answer, results written into plan://. Use when asked to grill, challenge, or pressure-test a plan, or before building something whose design has open decisions.
---

# Grill me

Reach a shared understanding of the plan before anything is built. The plan is a **design
tree**: each decision opens the decisions that hang off it. You are done when every branch
has been visited and nothing is silently assumed.

## Start from what is known

1. `read plan://` — the current plan, if there is one.
2. `memory_search` for decisions already made in this area. A recorded `decision` is settled;
   reopen it only if the plan contradicts it, and say so.

## Facts are yours, decisions are the user's

A **fact** is anything the environment can answer: how the code behaves, what a library
does, what an earlier session concluded. Never ask the user for one. Find it:

- `grep`, `read`, `find` in the working tree; `git://<rev>:<path>` for an older version.
- `session://` for an earlier conversation in this project.
- `web_search` then `web_fetch` for external documentation.
- A read-only `subagent` when the search is broad. It sees only its task, so state the
  question and paths; its answer arrives as a notice or through `subagent` `wait`.

A **decision** is a trade-off, preference, or priority. Put it to the user.

## Ask in rounds

The **frontier** is every decision whose prerequisites are settled. Ask the whole frontier
in one `questionnaire` call, one question per tab:

- Give each question 2–4 concrete options and mark your recommendation `recommended`.
- A decision that depends on another open question waits for a later round.
- A decision waiting on a fact still being looked up waits too; ask the rest now rather
  than blocking on the lookup.

After each round, recompute the frontier and ask again. Asking several questions per round
is what the user asked for here; it overrides the usual one-question rule.

## Record as you go

- Write each answer into `plan://` with an anchored `edit`, so the plan always shows what is
  settled. Put all changes to the plan in one `edit` call per round.
- `memory_save` with type `decision` for an answer that should outlive this task — one
  future work would otherwise re-litigate. Pass the project scope from the
  `<memory-store>` block.

## Finish

When the frontier is empty, show the settled decisions as a short list and ask the user to
confirm shared understanding. Do not start building until they do.
