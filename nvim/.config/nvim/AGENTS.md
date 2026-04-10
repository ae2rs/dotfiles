# Repository Guidelines

## Project Structure & Module Organization
- Entry point: `init.lua` sets leader keys, loads `lua/config/*`, and bootstraps `lazy.nvim` through `lua/config/lazy.lua`.
- Core editor behavior lives in `lua/config/`; keep these modules close to native Neovim concepts such as options, keymaps, autocmds, and shared helpers.
- Plugin specs live in `lua/plugins/`; keep them grouped by subsystem and prefer declarative `lazy.nvim` specs over extra wrapper layers.
- Server-specific LSP logic lives in `lua/lsp/`, including the monorepo-specific Rust/proto helpers. Read `lua/lsp/README.md` before changing that area.
- Helper scripts used by the config live in `scripts/`.
- Theme/filetype highlight overrides live under `after/syntax/`.
- Formatting config: `.stylua.toml`. Repo docs: `README.md`; license: `LICENSE.md`.

## Build, Test, and Development Commands
- Install/sync plugins headlessly: `nvim --headless "+Lazy! sync" +qa`.
- Check plugin status interactively: `:Lazy`.
- Format Lua: `stylua .` (uses `.stylua.toml` for 2-space indent, single quotes).
- Health check for core deps: `nvim --headless "+checkhealth" +qa`.
- Quick launch for manual verification: `nvim`.

## Coding Style & Naming Conventions
- Lua: 2-space indentation, Unix line endings, prefer single quotes (`.stylua.toml` enforced). Keep lines under 160 characters.
- Module naming: lower_snake_case filenames in `lua/`, majors grouped by feature area.
- Keep `lua/config/*` focused on editor-wide behavior and helper modules that multiple plugin specs reuse.
- Keep `lua/plugins/*` focused on plugin declaration and plugin-local configuration.
- Keep `lua/lsp/*` focused on server setup, root detection, project overrides, and monorepo integration.
- Plugin specs should stay declarative and minimal; avoid wrappers or abstraction layers unless they remove real duplication.
- Add short README-style docs in core directories when structure or local behavior becomes non-obvious.

## Testing Guidelines
- No automated test suite; rely on Neovim health checks and smoke tests.
- After significant changes, run `nvim --headless "+Lazy! sync" "+checkhealth" +qa` when plugin installation is involved.
- For keymap/plugin tweaks, validate in an interactive session and note manual verification in the final summary.

## Commit & Pull Request Guidelines
- Commit messages in this repo are short and scope-led (e.g., `nvim: add finder`, `lsp: restore rust setup`). Keep summaries imperative and concise.
- Include updates to `lazy-lock.json` when plugin versions change and the lockfile is present again.
- PRs should describe intent, key changes, and manual verification performed; add screenshots/gifs for UI-facing tweaks.
- Link related issues if applicable and call out any follow-up work or remaining gaps.

## Security & Configuration Tips
- Avoid committing secrets or credentialed endpoints in sample configs or test fixtures.
- Prefer native Neovim features first; add plugins only for clear gaps and record the rationale in the change summary or local docs when needed.
- When adding new plugins, prefer lazy-loading triggers where they materially reduce startup work.
