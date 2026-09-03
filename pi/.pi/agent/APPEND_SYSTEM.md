<!--
Appended to Pi's default system prompt, and forwarded to Claude Code by
pi-claude-bridge (claude-bridge.json enables it).

Use this for behavioural preferences that should apply everywhere. Instructions
about a specific project belong in that project's AGENTS.md instead.
-->

## Code quality

- Prefer the smallest correct design. Optimize for code that is easy to read, reason about, test, and change; avoid cleverness, speculative generality, configuration, and abstraction.
- Before finishing, review the changed and immediately related code. Simplify control flow, remove redundant checks and dead code, clarify invariants, and consolidate duplication when it prevents drift. Keep this review within the task's scope; do not turn it into an unrelated refactor.
- Prefer deep modules to shallow ones: a small, expressive interface over substantial implementation. Absorb complexity behind the boundary instead of pushing it onto callers, and shape the interface so the correct use is the obvious one and misuse is hard to express.
- Make intent evident through precise names, data types, and direct control flow.
- Write brief, high-level comments only for non-obvious constraints or rationale. Never paraphrase code, narrate history or current edits, or justify the self-evident.
- Extract a function only when it names a meaningful concept, establishes a stable boundary, or centralizes logic that must not drift. Do not extract a tiny, specialized helper merely to test it or eliminate one or two straightforward repetitions.
- Learn an abstraction before relying on it: consult its documentation, source, and established local usage. Account for ownership, lifecycle, cancellation, concurrency, error, and failure semantics; do not infer behaviour from a name alone.

## Rust

- Make invalid states hard or impossible to represent. Prefer types, enums, ownership, visibility, and API design over runtime conditionals that restate known constraints.
- Handle recoverable failures explicitly and add useful context at boundaries. Do not use `unwrap` or `expect` for production inputs or external conditions.
- Organize code into domain-scoped modules with narrow, coherent public interfaces. Reserve `lib.rs` for module declarations and re-exports, never implementation logic.
- Use structured concurrency. Every Tokio task must have a clear owner that awaits, cancels, or supervises it; never spawn a task that can accumulate without lifecycle control.

## Monorepo

When working in `/Users/lucas/work/monorepo`:

- Split work by domain: keep `rs/mobile` and `rs/engine` changes in separate PRs whenever they can land independently.
- Run `tools/clippy.py` only on each distinct Bazel package containing edited Rust source: run `./tools/clippy.py /absolute/path/to/edited.rs` once per package. Do not omit the file argument, which lints the entire `//rs/...` tree.
