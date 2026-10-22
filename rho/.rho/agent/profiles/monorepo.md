# Monorepo profile

Repository-provided instruction files and skills are deliberately not loaded by this profile. Use only the instructions and skills made available here.

- Split work by domain: keep `rs/mobile` and `rs/engine` changes in separate PRs whenever they can land independently.
- Run `tools/clippy.py` only on each distinct Bazel package containing edited Rust source: run `./tools/clippy.py /absolute/path/to/edited.rs` once per package. Do not omit the file argument, which lints the entire `//rs/...` tree.
- Title PRs `rs/<domain>[/<subdomain>]: <lowercase imperative description> ; <TICKET>`, e.g. `rs/core/binding: add testflight to Application binding ; CBE-1234`. Titles are capped at 80 characters (Danger fails longer ones): if the full title exceeds 80, drop ` ; <TICKET>`, since the branch name already carries it. Omit it too when there is no ticket.
