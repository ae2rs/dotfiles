---
name: request-review
description: Get an independent review of the current change from one fresh read-only subagent, checked against the stated intent and the project's rules, with findings anchored to path and N:hh so they can be verified and fixed directly. Use before committing or merging, or when asked for a review, a second opinion, or to review a branch or pull request.
---

# Request a review

A reviewer with a fresh context finds what the author stopped seeing. One reviewer, one
pass: no scores, no loop.

## 1. Pin the change

- Pick the base: what the user named, else `main`. Check it resolves (`git rev-parse`) and
  that `git diff <base>...` is not empty; fail here, not inside the reviewer.
- State the **intent** in two or three sentences: what the change should do, not how.
- Collect the rules that apply: the `AGENTS.md` sections and project conventions relevant
  to the files touched.

## 2. Give the reviewer the diff

A subagent cannot read this session's `run://`, so the diff must reach it another way:

- A pull request exists: point it at `pr://current/diff` (or `pr://<n>/diff`).
- Otherwise: paste `git diff --stat <base>...` into the task, and have it compare each
  changed file with `git://<base>:<path>`.
- A small diff can be pasted into the task whole.

## 3. Start the reviewer

Start one read-only `subagent`. Its task is self-contained: the intent, the rules, how to
reach the diff, and this brief:

> Review the change against the intent and the rules. Report findings as **must-fix**,
> **should-fix** or **consider**. Each finding is `path` + `N:hh` anchor from your `read` of
> the current file, then one line of reasoning. Cover: correctness and edge cases; behaviour
> the intent did not ask for; rule violations, citing the rule; simpler designs. Name a
> code smell only as a judgement call. Skip what formatters and linters enforce.
> Under 400 words.

Wait with `subagent` `wait`; the result stays at `agent://<name>`.

## 4. Act on the findings

- Check each finding with `read` before acting; a reviewer can be wrong. Say which ones you
  reject and why.
- Fix all accepted findings in one file with one `edit` call, using the reviewer's anchors
  directly. A refused stale anchor means the line changed since the review: `read` it again.
- Report what was fixed, what was rejected, and what remains as consider.
