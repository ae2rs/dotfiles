---
name: design-interface
description: Design a module's interface several radically different ways in parallel read-only subagents, then compare them on depth, misuse and what callers must know, and recommend one. Use when designing a new module or reshaping an existing one, when the first interface idea may not be the best, or when asked to "design it twice".
---

# Design an interface

Your first interface is unlikely to be the best. Design it several ways at once, then choose.

## 1. Frame the problem

Before starting any subagent, gather and show the user:

- The module's `path`, and its callers (`grep` for its uses).
- The constraints any interface must satisfy, and the dependencies behind it.
- A rough code sketch that makes the constraints concrete — not a proposal.

## 2. Start three designers

Start three read-only `subagent`s in one reply. A subagent sees only its task, so each task
repeats the paths, the callers, the constraints, and the vocabulary: **module**, **interface**
(everything a caller must know — types, invariants, ordering, error modes), **depth**
(behaviour per unit of interface), **seam**, **adapter**. Give each a different constraint:

1. Smallest interface: one to three entry points, most leverage per entry point.
2. Most flexible: supports many use cases and extension.
3. Best for the most common caller: the default case is trivial.

Add a fourth — ports and adapters around the dependencies — only when a dependency really
varies across the seam.

Each returns, in under 500 words:

1. The interface: types, functions, invariants, ordering, error modes.
2. A usage example from a real caller.
3. What the implementation hides behind the seam.
4. Trade-offs: where leverage is high, where it is thin.

Collect the designs with `subagent` `wait`, or from `agent://<name>`.

## 3. Compare and recommend

Present each design briefly, then compare them on:

- **Depth**: behaviour behind the interface.
- **Misuse**: how easy the wrong call is to write; whether types rule it out.
- **Caller knowledge**: what a caller must know that the types do not say.
- **Locality**: where future change concentrates.

Recommend one, or a hybrid when parts combine well. Be opinionated. In plan mode, record
the chosen design in `plan://` with an anchored `edit`.
