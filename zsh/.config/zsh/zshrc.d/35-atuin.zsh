# --- Atuin ---
# SQLite-backed shell history: unbounded retention, instant cross-terminal
# search, and flat shell-startup cost regardless of how large it grows.
#
# Must load AFTER 30-cli-tools.zsh so Atuin wins the Ctrl-R binding from
# fzf. OMZP::fzf is deliberately absent from 75-zinit.zsh for the same
# reason -- it re-runs `eval "$(fzf --zsh)"` in turbo, i.e. after this file,
# and would silently take Ctrl-R back.
#
# Config (local-only, no sync) lives in ~/.config/atuin/config.toml.
eval "$(atuin init zsh)"
