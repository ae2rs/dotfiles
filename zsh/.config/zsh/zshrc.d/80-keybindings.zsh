# Match common readline/Linux behavior for Ctrl+U in interactive prompts.
bindkey -M emacs '^U' backward-kill-line
bindkey -M viins '^U' backward-kill-line
