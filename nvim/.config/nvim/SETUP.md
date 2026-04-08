# Neovim Rebuild Setup

## Goals

- Rebuild the config from scratch so each piece is easy to understand.
- Prefer native Neovim APIs and small modules over clever abstractions.
- Keep the active config tiny until a feature has been explicitly chosen.
- Document the current setup before replacing it so nothing important is lost.
- Reintroduce features one subsystem at a time.

## Why The Old Config Felt Overbuilt

- It mixed a custom modular layout with leftover Kickstart modules.
- It had overlapping plugin responsibilities, especially around search, Git, and LSP UX.
- Rust/proto support in the monorepo depended on project-specific discovery logic, Neovim version branching, and notification filtering.
- Several plugins were installed for niche workflows that are not needed for a minimal base.

## Current Config Topology

The old setup was organized like this:

- `init.lua` bootstrapped `lazy.nvim`, loaded `lua/core/*`, then imported multiple plugin groups.
- `lua/plugins/*` held the main plugin specs.
- `lua/kickstart/plugins/*` still supplied autopairs, DAP, lint, Neo-tree, gitsigns keymaps, and indent guides.
- `lazy-lock.json` pinned the installed plugin set.

## Full Plugin List From The Old Setup

This is the full locked plugin set from `lazy-lock.json`.

### Core And Support

- `lazy.nvim`: plugin manager. Keep.
- `plenary.nvim`: Lua helper library used by Git/GitHub plugins. Revisit when those plugins return.
- `nui.nvim`: UI primitives used by `noice.nvim` and `neo-tree.nvim`. Revisit later.
- `nvim-web-devicons`: filetype icons for finder/tree/GitHub UI. Revisit later.
- `nvim-nio`: async helper used by DAP UI. Drop for now.

### Editing And Navigation

- `guess-indent.nvim`: auto-detect indentation. Revisit later.
- `which-key.nvim`: keymap popup. Revisit later.
- `telescope.nvim`: flexible picker UI for files, grep, buffers, and diagnostics. Keep.
- `telescope-fzf-native.nvim`: native sorter for Telescope. Keep.
- `fzf-lua`: file/buffer/grep/diagnostic picker. Dropped in favor of Telescope.
- `nvim-treesitter`: syntax tree parsing/highlighting. Strong keep candidate.
- `indent-blankline.nvim`: indentation guides. Drop for now.
- `nvim-autopairs`: bracket/quote pairing. Revisit later.
- `neo-tree.nvim`: file tree. Drop for now.
- `render-markdown.nvim`: markdown preview rendering. Drop for now.
- `mini.nvim`: currently used for `mini.ai`, `mini.surround`, and `mini.statusline`. Revisit later.

### UI

- `tokyonight.nvim`: colorscheme. Keep candidate if a theme is wanted early.
- `noice.nvim`: command line/message UI replacement. Drop for now.
- `nvim-notify`: notification UI backend. Drop for now.
- `todo-comments.nvim`: TODO/FIXME comment highlights. Drop for now.

### LSP, Completion, Formatting, Lint

- `nvim-lspconfig`: LSP server definitions and setup helpers. Strong keep candidate.
- `lazydev.nvim`: Lua development helpers for Neovim config. Revisit once Lua LSP returns.
- `mason.nvim`: tool installer. Revisit later.
- `mason-lspconfig.nvim`: Mason bridge for LSP servers. Revisit later.
- `mason-tool-installer.nvim`: automatic Mason tool install list. Drop for the first pass.
- `blink.cmp`: completion engine. Keep candidate after basic LSP is understood.
- `LuaSnip`: snippet engine used by completion. Revisit with completion.
- `conform.nvim`: formatting orchestration. Keep candidate after baseline editing is stable.
- `nvim-lint`: lint runner. Drop for now.

### Git And GitHub

- `gitsigns.nvim`: gutter signs and hunk actions. Strong keep candidate.
- `neogit`: full Git UI. Revisit later.
- `diffview.nvim`: diff view support for Neogit. Revisit later.
- `lazygit.nvim`: wrapper around LazyGit. Revisit later.
- `git-blame.nvim`: inline blame text. Drop for now.
- `gh-dash.nvim`: popup UI for `gh dash`. Drop for now.
- `octo.nvim`: GitHub issues/PR/discussions UI. Drop for now.
- `telescope.nvim`: no longer the main finder, but still installed as a dependency for GitHub/Git tooling. Drop for now.

### Debugging, REST, AI

- `nvim-dap`: debugger core. Drop for now.
- `nvim-dap-ui`: debugger UI. Drop for now.
- `mason-nvim-dap.nvim`: DAP tool installer. Drop for now.
- `nvim-dap-go`: Go-specific DAP integration. Drop for now.
- `kulala.nvim`: HTTP client workflow. Revisit later.
- `supermaven-nvim`: AI completion. Drop for now.

## Explicitly Configured Plugin Sources

These were the modules that actively configured the old plugin set:

- `lua/plugins/ai.lua`
- `lua/plugins/coding.lua`
- `lua/plugins/editor.lua`
- `lua/plugins/giet.lua`
- `lua/plugins/lsp.lua`
- `lua/plugins/test.lua`
- `lua/plugins/ui.lua`
- `lua/kickstart/plugins/autopairs.lua`
- `lua/kickstart/plugins/debug.lua`
- `lua/kickstart/plugins/gitsigns.lua`
- `lua/kickstart/plugins/indent_line.lua`
- `lua/kickstart/plugins/lint.lua`
- `lua/kickstart/plugins/neo-tree.lua`

Notable overlap in the old design:

- `gitsigns.nvim` was configured in two places.
- `telescope.nvim` was still installed only to support Git/GitHub plugins even though `fzf-lua` replaced it for searching.
- `lazydev.nvim` and `blink.cmp` were referenced across multiple subsystems.
- Some UI behavior lived in plugins while related editing behavior lived in `lua/core`.

## Current Rust And Proto Monorepo Setup

The old config had a custom Rust/proto path for `/Users/lucas/work/monorepo`.

### Rust Analyzer

Implemented in `lua/plugins/lsp.lua`:

- Default Rust settings:
  - diagnostics disabled
  - cargo `allFeatures = true`
  - `loadOutDirsFromCheck = true`
  - build scripts enabled
  - proc macros enabled
- Root detection order:
  - nearest `rust-analyzer.json`
  - nearest `Cargo.toml`
  - nearest git ancestor
  - fallback to parent directory
- On each new root, Neovim loaded project overrides from `<root>/rust-analyzer.json`.
- The loaded JSON was merged into the default settings.
- The config explicitly removed `lspMux` from the merged settings.
- On Neovim 0.11+, the setup used `vim.lsp.config('rust_analyzer', ...)` and `vim.lsp.enable('rust_analyzer')`.
- `before_init` copied the merged `rust-analyzer` table into `initializationOptions` so project discovery actually applied.
- `mason-lspconfig` auto-enable explicitly excluded `rust_analyzer`.

### Monorepo `rust-analyzer.json`

The monorepo file at `/Users/lucas/work/monorepo/rust-analyzer.json` adds Bazel-specific discovery:

- `cargo.targetDir = false`
- build/check commands override to:
  - `./tools/clippy.py --json $saved_file`
- workspace discovery command:
  - `./tools/rust_analyzer.sh {arg}`
- watched files:
  - `BUILD`
  - `BUILD.bazel`
  - `MODULE.bazel`
- proc macro exceptions for:
  - `async-recursion`
  - `napi-derive`

### Proto LSP

Also in `lua/plugins/lsp.lua`:

- `protols` was configured separately from the Mason/LSP defaults.
- Include paths were hard-coded to:
  - `/Users/lucas/work/monorepo/rs`
  - `/Users/lucas/work/monorepo/rs/proto`
- Root detection preferred:
  - `protols.toml`
  - `WORKSPACE`
  - `WORKSPACE.bazel`
  - `MODULE.bazel`
  - `.git`
- If a file lived under the monorepo path, the root was forced to the monorepo root.

### Monorepo-Specific Extra Behavior

- `.proto` lint diagnostics were suppressed for monorepo files in `lua/core/monorepo.lua`.
- `vim.notify` and the LSP message handlers were patched to hide noisy:
  - overly long loop warnings
  - `EMFILE` / too many open files messages
- LSP keymaps still used Telescope pickers for references, definitions, and symbols even though `fzf-lua` was the main search plugin elsewhere.

### Why This Is Convoluted

- It branches between native Neovim 0.11 APIs and older `lspconfig` behavior.
- It depends on project-local JSON configuration outside this repo.
- It mixes generic editor concerns with one monorepo's Bazel discovery logic.
- It patches message handling to suppress symptoms from the toolchain and file watching stack.

## Recommendations For The Rebuild

### First Stage

- Start with only `lazy.nvim`.
- Keep the config readable enough that each file can be understood in one sitting.
- Delay all plugin decisions until the base config feels obvious.

### Recommended Feature Reintroduction Order

1. Core options, keymaps, and autocmds
2. Colorscheme, if desired
3. File finder
4. Treesitter
5. Basic LSP
6. Rust/proto monorepo support
7. Completion
8. Formatting
9. Git
10. Everything else

### Suggested Minimal Choices Later

- File finder: use `telescope.nvim` with `telescope-fzf-native.nvim` as the default search UI so file search, grep, buffers, recent files, and diagnostics all share one predictable interface.
- Treesitter: use `nvim-treesitter`, but only after deciding which languages actually matter.
- LSP: start with built-in Neovim 0.11 APIs plus `nvim-lspconfig`; add Mason only if manual tool management becomes annoying.
- Completion: add `blink.cmp` only after LSP is working and understood.
- Formatting: start with `vim.lsp.buf.format()` or manual formatting; add `conform.nvim` when multi-tool formatting becomes necessary.
- Git: start with `gitsigns.nvim`; keep heavy Git/GitHub UI out until there is a specific need.
- File tree: skip it initially and rely on finder plus normal file navigation.
- UI extras: keep built-in UI first; only add `tokyonight.nvim` early if a theme helps readability.

## Target Structure For The New Config

The active config should stay close to this shape:

- `init.lua`
- `lua/config/options.lua`
- `lua/config/keymaps.lua`
- `lua/config/autocmds.lua`
- `lua/config/lazy.lua`

Future plugin specs should only appear when needed, ideally as small files under `lua/plugins/`.

## Rebuild Progress

### Current Active Subsystems

- `lazy.nvim` for plugin management
- `which-key.nvim` plus `lua/config/keys.lua` for organized leader-based keymaps
- `telescope.nvim` plus `telescope-fzf-native.nvim` for search and picker workflows
- `lua/config/search.lua` to keep hidden-file search defaults and the explicit ignore list in one place
- `mason.nvim` plus `mason-lspconfig.nvim` to install and manage `lua_ls`
- `nvim-lspconfig` using the native `vim.lsp.config()` / `vim.lsp.enable()` flow
- `lazydev.nvim` to make Neovim Lua editing sane without loading huge LuaLS workspaces
- `conform.nvim` with `stylua` for Lua formatting

### Why These Came Back First

- The keymap helper makes it easy to grow the config without ending up with random leader bindings.
- Telescope gives one consistent UI for file search, grep, buffers, old files, and diagnostics.
- Lua editing is the immediate environment needed to keep rebuilding the config.
- `lua_ls` gives diagnostics, navigation, hover, and rename without pulling in broader language tooling yet.
- `lazydev.nvim` is purpose-built for Neovim config Lua and keeps the setup small.
- `conform.nvim` plus `stylua` gives deterministic formatting without mixing formatting concerns into the LSP setup.
