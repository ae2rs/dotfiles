# Lua Layout

The Lua tree is split by responsibility:

- [`config/`](./config/): native Neovim setup and shared helpers used across the config
- [`plugins/`](./plugins/): `lazy.nvim` plugin specs grouped by subsystem
- [`lsp/`](./lsp/): server-specific helpers and monorepo-specific LSP behavior

Use `config` for editor-wide behavior that should exist even without a plugin.
Use `plugins` when the code only exists to declare or configure a plugin.
Use `lsp` for language-server setup that is specific enough to be awkward inside a generic plugin spec.

Read the local folder readmes before moving logic between these areas.
