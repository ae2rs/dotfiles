# --- History ---
# macOS /etc/zshrc sets HISTSIZE=2000 / SAVEHIST=1000, which silently discards
# the oldest commands once the file fills. Atuin (35-atuin.zsh) is the real
# archive now; this keeps ~/.zsh_history as a sane fallback.
HISTSIZE=50000
SAVEHIST=50000

setopt EXTENDED_HISTORY     # record timestamps and durations
setopt INC_APPEND_HISTORY   # write as commands run, not on shell exit
setopt HIST_IGNORE_ALL_DUPS # keep only the most recent copy of a command
setopt HIST_IGNORE_SPACE    # a leading space keeps a command out of history
setopt HIST_REDUCE_BLANKS

# No SHARE_HISTORY on purpose: nothing interactive reads this file any more.
# Ctrl-R, Up (35-atuin.zsh) and zsh-autosuggestions all go through Atuin, which
# is cross-terminal already, so sharing would only add cross-session writes to
# a file that is now just an archive. Ctrl-P/Ctrl-N still walk it, per session.
