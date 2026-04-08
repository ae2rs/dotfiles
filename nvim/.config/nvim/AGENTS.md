# Repository Guidelines

## Project Structure & Module Organization
- Entry point: `init.lua` sets leader keys, loads `lua/config/*`, and bootstraps `lazy.nvim` through `lua/config/lazy.lua`.
- The active config is intentionally minimal. Add future plugin specs under `lua/plugins/` only when a feature is deliberately reintroduced.
- Planning and inventory live in `SETUP.md`. Read it before adding features back.
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
- Keep `lua/config/*` close to native Neovim concepts: options, keymaps, autocmds, lazy bootstrap.
- Plugin specs should stay declarative and minimal; avoid adding wrappers or abstraction layers unless they remove real duplication.

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
- Prefer native Neovim features first; add plugins only for clear gaps and record the rationale in `SETUP.md` or the change summary.
- When adding new plugins, prefer lazy-loading triggers where they materially reduce startup work.
