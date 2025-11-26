# Repository Guidelines

## Project Structure & Module Organization
- Entry point: `init.lua` boots `lazy.nvim`, sets leader keys, and loads core modules from `lua/core` (`options`, `keymaps`, `autocmds`, `monorepo`).
- Plugin specs live in `lua/plugins/*.lua` grouped by focus (`ui`, `editor`, `lsp`, `coding`, `lang`, `test`, `ai`, `giet`). Kickstart-derived tweaks are under `lua/kickstart/plugins`.
- Dependency pins: `lazy-lock.json`. Update it when plugin versions change.
- Formatting config: `.stylua.toml`. Repo docs: `README.md`; license: `LICENSE.md`.

## Build, Test, and Development Commands
- Install/sync plugins headlessly: `nvim --headless "+Lazy! sync" +qa`.
- Check plugin status interactively: `:Lazy`.
- Format Lua: `stylua .` (uses `.stylua.toml` for 2-space indent, single quotes).
- Health check for core deps: `nvim --headless "+checkhealth" +qa`.
- Quick launch for manual verification: `nvim` (ensure `vim.g.have_nerd_font` matches your setup).

## Coding Style & Naming Conventions
- Lua: 2-space indentation, Unix line endings, prefer single quotes (`.stylua.toml` enforced). Keep lines under 160 characters.
- Module naming: lower_snake_case filenames in `lua/`, majors grouped by feature area.
- Keymaps follow leader-based patterns defined in `lua/core/keymaps.lua`; keep new mappings under the appropriate prefix.
- Plugin specs should be declarative tables returned from each module; avoid side effects at require-time.

## Testing Guidelines
- No automated test suite; rely on Neovim health checks and smoke tests.
- After significant changes, run `nvim --headless "+Lazy! sync" "+checkhealth" +qa` to ensure plugins install and dependencies resolve.
- For mapping/plugin tweaks, validate in an interactive session and note any manual steps in commit messages or PRs.

## Commit & Pull Request Guidelines
- Commit messages in this repo are short and scope-led (e.g., `lsp: tighten diagnostics`, `ui: adjust statusline`). Keep summaries imperative and concise.
- Include updates to `lazy-lock.json` when plugin versions change; mention notable plugin bumps in the description.
- PRs should describe intent, key changes, and manual verification performed; add screenshots/gifs for UI-facing tweaks.
- Link related issues if applicable and call out any follow-up work or remaining gaps.

## Security & Configuration Tips
- Avoid committing secrets or credentialed endpoints in plugin/test fixtures (e.g., REST clients).
- Keep `vim.g.have_nerd_font` accurate to prevent icon misrendering; document any OS-specific dependencies added.
- When adding new plugins, prefer lazy-loading triggers (events, filetypes, commands) to maintain startup speed.
