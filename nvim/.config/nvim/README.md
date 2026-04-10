# Neovim Config

This repository contains the active Neovim configuration used from `~/.config/nvim`.
It is built around `lazy.nvim`, small Lua modules, and a few project-specific LSP helpers for a Rust/proto monorepo.

## Layout

- [`init.lua`](./init.lua): entrypoint that loads the core config modules.
- [`lua/config/`](./lua/config): native Neovim options, keymaps, autocmds, and shared helpers.
- [`lua/plugins/`](./lua/plugins): lazy.nvim plugin specs grouped by subsystem.
- [`lua/lsp/`](./lua/lsp): server-specific helpers and monorepo-specific LSP behavior.
- [`scripts/`](./scripts): helper scripts used by the Neovim config.
- [`after/syntax/`](./after/syntax): filetype-specific highlight overrides kept from earlier theme work.

More local context lives in:

- [`lua/README.md`](./lua/README.md)
- [`lua/config/README.md`](./lua/config/README.md)
- [`lua/plugins/README.md`](./lua/plugins/README.md)
- [`lua/lsp/README.md`](./lua/lsp/README.md)
- [`scripts/README.md`](./scripts/README.md)

## Current Setup

The current config is not a minimal bootstrap. It already includes:

- `lazy.nvim` for plugin management
- `which-key.nvim` for keymap discovery
- `fzf-lua` and `telescope.nvim` for search and picker workflows
- `neo-tree.nvim` for file exploration
- `gitsigns.nvim`, `neogit`, and `diffview.nvim` for Git workflows
- `nvim-lspconfig`, `mason.nvim`, `mason-lspconfig.nvim`, and `lazydev.nvim` for LSP
- custom Rust and proto LSP modules under [`lua/lsp/`](./lua/lsp)
- `blink.cmp` for completion
- `conform.nvim` for formatting Lua buffers with `stylua`
- `fidget.nvim`, `noice.nvim`, `tiny-inline-diagnostic.nvim`, and `tokyonight.nvim` for UI polish
- `nvim-treesitter` for parser support

## Commands

- Sync plugins: `nvim --headless "+Lazy! sync" +qa`
- Run health checks: `nvim --headless "+checkhealth" +qa`
- Sync plugins and run health checks: `nvim --headless "+Lazy! sync" "+checkhealth" +qa`
- Format the repo: `stylua .`
- Launch Neovim: `nvim`

## Notes

- The LSP setup includes monorepo-specific Rust and proto behavior. Read [`lua/lsp/README.md`](./lua/lsp/README.md) before changing those modules.
- Plugin specs are intentionally split by behavior rather than by plugin dependency tree.
- `after/syntax/` still contains many `gruvbox_material` overrides even though the active colorscheme is currently `tokyonight`. Treat that directory as legacy theme customization unless you intentionally clean it up.
