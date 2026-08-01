# Restores oh-my-zsh lib/directories.zsh behavior, which was dropped in 8025bf2
# when zinit replaced OMZ (only OMZL::git.zsh is loaded now, not the directories lib).
# Written out explicitly rather than via `zinit snippet OMZL::directories.zsh`:
# ~4x cheaper at startup (0.12ms vs 0.5ms eager) and no OMZ dependency.

setopt auto_cd              # bare `..` or `foo/` cds into it
setopt auto_pushd           # every cd pushes onto the directory stack
setopt pushd_ignore_dups
setopt pushdminus           # REQUIRED: makes `cd -1` mean "previous dir".
                            # Without it, `cd -N` counts from the END of the
                            # stack and the 1-9 aliases below navigate backwards.

alias -g ...='../..'
alias -g ....='../../..'
alias -g .....='../../../..'
alias -g ......='../../../../..'

alias -- -='cd -'
for i in {1..9}; do alias "$i=cd -$i"; done
unset i

alias md='mkdir -p'
alias rd=rmdir

# `d` with no args lists the 10 most recent directories; with args, passes to dirs.
# No `compdef _dirs d`: compinit doesn't run until zinit's turbo atinit in
# 75-zinit.zsh, so compdef isn't defined yet at this point in the load order.
d() {
  if [[ -n $1 ]]; then
    dirs "$@"
  else
    dirs -v | head -n 10
  fi
}
