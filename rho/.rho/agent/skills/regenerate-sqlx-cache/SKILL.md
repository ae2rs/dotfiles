---
name: "regenerate-sqlx-cache"
description: "Regenerate a server Rust API's SQLx offline cache and validate it without wildcard SQLx purge failures"
version: 1
created: "2026-09-02"
updated: "2026-09-02"
---

## When to Use

Use after changing SQL queries in a server-only Rust API that uses `sqlx_prepare`.

## Procedure

1. Ensure the package's `sqlx_prepare(...)` sets `cfg = "server"` when its Rust library has `cfgs = ["server"]`.
2. Regenerate with `./tools/sqlx_prepare.sh //path/to/package:sqlx_prepare`; this grants the action write access to the workspace and sets the SQLx generation flags.
3. Validate the actual Rust targets directly with `bazel build //path/to/package:_<crate> //path/to/package:_<crate>_bin //path/to/package:_<crate>_test --//rs:cfg=server`.
4. Run the package's requested focused tests/builds with the matching `--//rs:cfg` value.

## Pitfalls

- `bazel run //path:sqlx_prepare` is not valid here because the aggregate target is not executable.
- A `//path/...` build includes the untagged `sqlx_dir_purge` target. Outside the regeneration script, its sandbox cannot delete workspace `.sqlx` files, so validate named Rust targets instead.
- Use `--//rs:cfg=server` for `rs/engine/**` server Rust targets and `--//rs:cfg=client` for `rs/mobile/**` targets.

## Verification

1. The SQLx script reports the generated query JSON files and exits successfully.
2. The direct Rust library, binary, and test targets build successfully.
3. `git diff --check` passes.
