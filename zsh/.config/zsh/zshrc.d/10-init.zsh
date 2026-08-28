# Starship prompt
eval "$(starship init zsh)"

# Completion system is initialized by zinit (75-zinit.zsh) via
# `zicompinit; zicdreplay` after all plugins finish loading.

# Editor
export EDITOR="nvim"

# Emacs line editing at the prompt.
#
# Must come right after EDITOR: with neither `bindkey -e` nor `-v` given, zsh
# infers its main keymap from $EDITOR, and the "vi" in "nvim" silently puts ZLE
# in vi mode. There, a bare ESC is bound to vi-cmd-mode, so any ESC-prefixed
# sequence zsh doesn't recognise (Option+Arrow, Option+Backspace, and anything
# Neovim's :terminal emits) falls back to that prefix and dumps the prompt into
# vi command mode instead of moving a word.
#
# Also has to run before the fzf (30) and atuin (35) init evals, so they install
# their Ctrl-R/Ctrl-T widgets into the keymap we actually use.
bindkey -e
