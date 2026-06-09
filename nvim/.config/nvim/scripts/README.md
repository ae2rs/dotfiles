# Helper Scripts

This directory contains helper scripts that are invoked by the Neovim config.

Current script:

- `rust_analyzer_discover.py`: wraps a Rust Analyzer workspace discover command, normalizes relative JSON payload paths, and injects a fallback title when the command omits one.

Notes:

- The wrapper is used from `lua/lsp/rust_analyzer.lua`.
- `NVIM_RA_DISCOVER_TRACE` can be set to a file path to log wrapper inputs for debugging.
- `scripts/__pycache__/` may appear locally from running the wrapper and is not part of the documented config surface.
