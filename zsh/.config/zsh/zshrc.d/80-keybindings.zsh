# ZLE runs in emacs mode -- see the `bindkey -e` note in 10-init.zsh.

# Match common readline/Linux behavior for Ctrl+U (zsh defaults to
# kill-whole-line here).
bindkey -M emacs '^U' backward-kill-line

# Word motions for Option/Alt + arrows and Option+Backspace.
#
# The emacs keymap covers ^[b / ^[f out of the box but nothing else, so bind
# every sequence a macOS terminal might actually send:
#   ^[[1;3x  Option+Arrow, xterm style -- this is what Neovim's :terminal emits
#   ^[[1;9x  Option+Arrow, Terminal.app / older iTerm2 style
#   ^[^?     Option+Backspace
#   ^[[3;3~  Option+Delete (forward)
# Unbound ESC-prefixed sequences fall back to their longest bound prefix, which
# is how these used to end up doing something surprising instead of nothing.
bindkey -M emacs '^[[1;3D' backward-word
bindkey -M emacs '^[[1;3C' forward-word
bindkey -M emacs '^[[1;9D' backward-word
bindkey -M emacs '^[[1;9C' forward-word
bindkey -M emacs '^[^?'    backward-kill-word
bindkey -M emacs '^[[3;3~' kill-word
