---
name: deepen-architecture
description: Find deepening opportunities in a codebase — shallow modules, leaky seams, pass-throughs — rank them by recent churn, present candidates, then grill through the one the user picks. Use when asked to improve architecture, find refactoring opportunities, consolidate tightly coupled modules, or make code easier to test and navigate.
---

# Deepen architecture

Surface architectural friction and propose **deepening opportunities**: refactors that turn
shallow modules into deep ones, for testability and navigability.

## Vocabulary

Use these terms exactly; do not drift into "component", "service", "API" or "boundary".

- **Module**: anything with an interface and an implementation — function, type, crate, slice.
- **Interface**: everything a caller must know to use the module correctly: signature, but
  also invariants, ordering, error modes, configuration, performance.
- **Depth**: behaviour a caller can exercise per unit of interface learned. **Deep**: a lot
  behind a small interface. **Shallow**: the interface is nearly as complex as the body.
- **Seam**: where an interface lives; a place behaviour can change without editing in place.
- **Adapter**: a concrete thing satisfying an interface at a seam.
- **Leverage**: what callers get from depth. **Locality**: what maintainers get — change,
  bugs and knowledge concentrated in one place.

Principles:

- **Deletion test**: imagine deleting the module. If complexity vanishes, it was a
  pass-through. If it reappears across N callers, it was earning its keep.
- **The interface is the test surface.** Wanting to test past it means the shape is wrong.
- **One adapter is a hypothetical seam; two adapters make a real one.** Do not add a seam
  nothing varies across.

## 1. Decide where to look

1. `memory_search` for earlier architecture decisions and rejected refactors, so they are
   not suggested again.
2. If the user named a module or pain point, look there. Otherwise rank by churn:

   ```bash
   git log --format= --name-only --since=90.days | sort | uniq -c | sort -rn
   ```

   Hot files pull attention first; scattered churn means widen the net.

## 2. Explore

Start read-only `subagent`s in one reply, one per area. Each task is self-contained: the
paths, the vocabulary above, and the questions below. Ask each to cite `path` and `N:hh`
anchors for every claim, and to answer in under 400 words.

- Where does understanding one concept mean bouncing between many small modules?
- Where is a module shallow — interface as complex as its implementation?
- Where were pure functions extracted for testability while the bugs live in how they are called?
- Where do coupled modules leak across their seams?
- What is untested, or hard to test through its current interface?

Collect results with `subagent` `wait`, or from `agent://<name>`. Check the strongest claims
yourself with `read` before presenting them.

## 3. Present candidates

A numbered list, strongest first. For each:

- **Files**: the modules involved.
- **Problem**: the friction, in the vocabulary above.
- **Change**: what would change, in plain words. No interfaces yet.
- **Benefit**: in leverage and locality, and how tests improve.
- **Strength**: strong, worth exploring, or speculative.

If a candidate contradicts a recorded decision, include it only when the friction justifies
reopening it, and say which decision. Then ask which to explore with `questionnaire`.

## 4. Grill the chosen candidate

Follow the grill-me skill (`read skill://grill-me/SKILL.md`): the constraints, what sits
behind the seam, the shape of the deepened module, which tests survive. To compare
interface shapes, follow design-interface (`skill://design-interface/SKILL.md`).

If the user rejects a candidate for a reason a future review would need, offer to
`memory_save` it as a `decision` so it is not suggested again. Skip reasons that are
temporary ("not now") or self-evident.
