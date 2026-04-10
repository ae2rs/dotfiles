# Plugin Specs

Each file in this directory defines one subsystem worth of `lazy.nvim` specs.

Current groups include:

- `theme.lua`, `ui.lua`: colorscheme and UI behavior
- `fzf.lua`, `telescope.lua`, `explorer.lua`: navigation and search
- `git.lua`: Git status, blame, diff, and branch/reset flows
- `lsp.lua`, `completion.lua`, `formatting.lua`, `treesitter.lua`: language tooling
- `keymaps.lua`: which-key integration
- `noice.lua`: focused LSP hover/signature UI behavior

Guidelines:

- Prefer one cohesive spec group per file instead of one file per dependency.
- Keep specs declarative and local to the plugin they configure.
- Use `config.keys` helpers for lazy key definitions so descriptions stay consistent.
- Move server-specific LSP logic into [`../lsp/README.md`](../lsp/README.md) rather than bloating `lsp.lua`.
