# LSP Modules

This directory contains the non-trivial language-server logic that does not fit cleanly inside the generic plugin spec in `lua/plugins/lsp.lua`.

Current modules:

- `lua_ls.lua`: Lua language server settings
- `monorepo.lua`: shared monorepo paths plus notification/LSP message filtering
- `rust_analyzer.lua`: Rust root detection, project-local `rust-analyzer.json` loading, command normalization, and discover-command wrapping
- `protols.lua`: proto root detection and monorepo include path handling

Important behavior:

- Rust roots prefer `rust-analyzer.json`, then `Cargo.toml`, then `.git`.
- Rust project overrides are loaded from a project-local `rust-analyzer.json` when present.
- Relative commands in Rust overrides are normalized against the project root before startup.
- Workspace discover commands are wrapped through [`../../scripts/rust_analyzer_discover.py`](../../scripts/rust_analyzer_discover.py) so missing titles and relative paths do not break the Neovim client flow.
- Proto files under `/Users/lucas/work/monorepo` are forced to use the monorepo root and include paths from `monorepo.lua`.
- `monorepo.lua` also suppresses a small set of noisy notify/LSP messages for the monorepo workflow.

If you change root detection, override loading, or the message filters, re-check the monorepo editing workflow manually.
