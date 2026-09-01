---
name: rs-scalar-to-types-crate-migration
description: >-
  Move one or more types from `rs/platform/library/scalar` into a new
  `rs/platform/types/<module>` crate (`types_<module>`) in this monorepo. Use
  for Lucas's standard three-commit flow: `boilerplate`, `compile`, `migrate`,
  including Rust/proto/Bazel callsite updates, AppClip or web fallout, and
  cleanup with `allfmt`, `./tools/unused_imports.py`, and
  `./tools/proto_unused_imports.py --auto-fix`.
compatibility: >-
  wesprint-io/monorepo checkout with Bazel, gh, rg, perl, clang-format,
  buildifier, and repo tools available.
---

# Scalar -> types_* crate migration

## When to use this skill

Use this skill when work includes:

- extracting one or more Rust business types out of `rs/platform/library/scalar`
- creating a new `rs/platform/types/<module>` crate with `crate_name = "types_<module>"`
- moving the matching proto from `platform.scalar` to `platform.types.<module>`
- migrating Rust/proto/Bazel callsites across the repo
- following the proven `boilerplate` -> `compile` -> `migrate` pattern from PR #27410 (`types_invite_code`)

## Read this first

Before editing anything, read `references/scalar-to-types-playbook.md` in full.

Also inspect these repo files before starting:

- `rs/platform/library/scalar/BUILD.bazel`
- `rs/platform/library/scalar/src/lib.rs`
- `rs/platform/library/scalar/proto/BUILD.bazel`
- `rs/platform/types/invite_code/BUILD.bazel`
- `rs/platform/types/invite_code/src/lib.rs`
- `rs/platform/types/invite_code/src/invite_code.rs`
- `rs/platform/types/invite_code/definitions.proto`

## Hard constraints

- Use Bazel, never Cargo.
- Prefer exactly three commits named `boilerplate`, `compile`, and `migrate`.
- During `boilerplate`, do not touch `scalar` yet.
- During `compile`, carefully copy/move the code into the new crate and only make `//rs/platform/library/scalar` plus the destination `//rs/platform/types/<module>` compile; ignore broken imports elsewhere until `migrate`.
- During `migrate`, maximize mechanical/bulk edits and minimize ad hoc manual rewrites.
- Remove deps/imports only when a cleanup tool proves they are unused.
- If `allfmt` alias is unavailable in non-interactive shells, run its expanded commands explicitly.

## Workflow summary

1. Define the module name, migrated types, old scalar files, and old/new proto labels.
2. Create the new crate skeleton in a `boilerplate` commit.
3. Copy the Rust/proto implementation into the new crate, remove the old scalar exports/files, and make only the scalar and destination crates compile in a `compile` commit.
4. Migrate all Rust/proto/Bazel callsites in a `migrate` commit.
5. Run cleanup and formatting: `./tools/unused_imports.py`, `./tools/proto_unused_imports.py --auto-fix`, and `allfmt` or its explicit equivalent.
6. Re-run `./tools/clippy.py` and verify no old references remain.

## Validation commands

- compile phase: `bazel build //rs/platform/types/<module> //rs/platform/library/scalar`
- final phase: `./tools/clippy.py`
- cleanup: `./tools/unused_imports.py`
- cleanup: `./tools/proto_unused_imports.py --auto-fix`
- formatting: `allfmt` or the explicit commands from the playbook

## References

- `references/scalar-to-types-playbook.md` - detailed runbook, command shapes, and final invariants
