# Config Modules

This directory holds editor-wide configuration and small helpers that multiple plugin specs reuse.

Current modules:

- `options.lua`: base Neovim options
- `keymaps.lua`: global keymaps and top-level leader group setup
- `autocmds.lua`: editor autocmds
- `lazy.lua`: `lazy.nvim` bootstrap and setup
- `keys.lua`: helper functions for normal keymaps and lazy key spec creation
- `search.lua`: shared search command builders for Telescope and FzfLua
- `git.lua`: shared Git actions used by keymaps and plugin callbacks
- `explorer.lua`: small wrapper around the file explorer toggle

Guidelines:

- Keep modules close to built-in Neovim concepts.
- Put shared helpers here only when they are reused by more than one place.
- Avoid turning this directory into a generic utility layer.
