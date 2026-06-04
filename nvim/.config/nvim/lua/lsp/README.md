# LSP Modules

This directory contains the non-trivial language-server logic that does not fit cleanly inside the generic plugin spec in `lua/plugins/lsp.lua`.

Current modules:

- `lua_ls.lua`: Lua language server settings
- `gopls.lua`: Go language server settings (gofumpt, staticcheck, analyses, inlay hints)
- `monorepo.lua`: notification/LSP message filtering for the monorepo workflow

Important behavior:

- `monorepo.lua` suppresses a small set of noisy notify/LSP messages (e.g. "overly long loop turn", workspace discovery failures) for the monorepo workflow.

The monorepo rust-analyzer and protols configuration now lives in the repo's own project-local `.nvim.lua` (exrc). See PR wesprint-io/monorepo#30364.

If you change the message filters, re-check the monorepo editing workflow manually.
