---
name: adhd
description: Rewrite your previous response so a reader with ADHD can act on it — next action first, numbered steps, state restated, tangents cut, wins visible. Use only when the user invokes it by name.
license: MIT, adapted from https://github.com/ayghri/i-have-adhd
disable-model-invocation: true
---

# Rewrite the last response for ADHD

Rewrite your previous response — the last one before this message. Send only the rewrite.

## What stays fixed

- The facts. Do not redo the work, run tools, or add findings.
- Every real finding, path, command and number. Cut words, never content.
- If the user added a request after this skill, apply it to the rewrite.

## Why the shape matters

1. Working memory is small. What is not on screen is forgotten.
2. Knowing is not doing. The gap between "got it" and "done it" kills work.
3. Starting is the hardest step. The first action must be obvious and small.
4. Vague time feels uniform. "A bit" and "a few hours" read the same.
5. Buried wins do not register. Progress must be visible.

## Rules

### 1. Lead with the next action

The first line is something the reader can do, or the answer itself. Commands, paths and snippets go first. Prose comes after, if at all.

### 2. Number multi-step work

One bounded action per step. Use the fewest steps that still work. Fold trivial steps into the one before.

### 3. End with one concrete next action

If anything is open, name one thing doable in under two minutes. "Next: run `bun test` and paste the first failing line."

### 4. Suppress tangents

Finish the main point. Move any second issue to one line at the end: "Separately: X. Want me to handle it?"

### 5. Restate state

Say where the work stands: "Step 3 of 5 done: schema updated. Next: backfill the column."

### 6. Concrete time estimates

Only when grounded, and in real units: "About 15 minutes if tests cover it." Drop vague ones.

### 7. Make wins visible

Say what now works and how to see it: "Login works with magic links. Try `bun dev`, open `/login`."

### 8. Matter-of-fact errors

State what failed, the cause, the fix. No "Uh oh" or "There seems to be".

### 9. Cap visible lists at 5

Group related items and rank the most relevant first. Never drop a real finding to hit the cap.

### 10. No preamble, no recap, no closers

Cut "Great question", "Let me…", "I'll…", "Looking at…", recaps of what was just shown, and "Let me know if…", "Hope this helps".

## When the rules bend

- The original explained or walked through something: keep the full body, add headers so it can be skimmed.
- The answer is a set of options: keep 2 to 4, ranked, recommendation first, one-line trade-offs each.
- A destructive action was pending: keep the confirmation.

## Pre-send check

Delete:

1. A first sentence that announces what comes next.
2. A last sentence that recaps or asks "anything else?".
3. Any "by the way" sidebar.
4. Hedges that add nothing ("perhaps", "might"). Keep a hedge that carries real uncertainty.
5. Idioms ("circle back", "on the same page"). Use the literal action.

Then check: from the first and last lines alone, does the reader know what just happened and what to do next? If yes, send.
