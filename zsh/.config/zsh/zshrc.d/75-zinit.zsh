# zinit plugin manager
# https://github.com/zdharma-continuum/zinit
ZINIT_HOME="${HOME}/.local/share/zinit/zinit.git"
source "${ZINIT_HOME}/zinit.zsh"

# zicompinit runs `compinit -C`: it trusts the dump as is, with no compaudit and
# no rebuild whenever the count of completion files in fpath differs from the
# dump's, which cost a tab 0.5-1.5s each time it flip-flopped. Instead, a dump
# older than a day is rebuilt by a detached `zsh -f` once fpath is final, and
# the next tab loads it. `rm ~/.zcompdump` rebuilds it in the next tab itself.
ZINIT[COMPINIT_OPTS]=-C
_zcompdump_refresh() {
  unfunction _zcompdump_refresh
  () {
    (( $# )) || return 0
    zsh -fc 'autoload -Uz compinit; fpath=("${@:2}")
      compinit -C -d $1.$$ && mv -f $1.$$ $1' zsh $1 $fpath </dev/null >/dev/null 2>&1 &!
  } ${ZDOTDIR:-$HOME}/.zcompdump(N.mh+24)
}

# Completions that tools print themselves, kept in zinit's completions dir
# (already on fpath). Each is regenerated in the background only when it is
# missing or older than its binary, so an ordinary tab spawns nothing. Each is
# also registered directly, as `compinit -C` only sees new fpath files once the
# dump is rebuilt. kubectl's comes with its Homebrew formula.
_tool_completions() {
  unfunction _tool_completions
  local dir=$ZSH_CACHE_DIR/completions cmd file
  local -A gen=(
    docker 'docker completion zsh'
    rustup 'rustup completions zsh'
    uv     'uv generate-shell-completion zsh'
    uvx    'uvx --generate-shell-completion zsh'
  )
  # Defers to the default toolchain's own _cargo at completion time. Not plain
  # `rustc`, which inside a project with an uninstalled pinned toolchain would
  # make rustup install it.
  [[ -f $dir/_cargo ]] || print -r -- '#compdef cargo' \
    'source "$(rustup run ${${(z)$(rustup default)}[1]} rustc --print sysroot)"/share/zsh/site-functions/_cargo' \
    >| $dir/_cargo
  for cmd in cargo ${(k)gen}; do
    (( $+commands[$cmd] )) || continue
    file=$dir/_$cmd
    if [[ -n $gen[$cmd] ]] && [[ ! -s $file || $commands[$cmd] -nt $file ]]; then
      { eval $gen[$cmd] >| $file.$$ && mv -f $file.$$ $file || rm -f $file.$$ } </dev/null 2>/dev/null &!
    fi
    (( $+_comps[$cmd] )) || { autoload -Uz _$cmd; compdef _$cmd $cmd }
  done
}

# --- Eager: OMZ libs/plugins that set up env (PATH/fpath/vars) used by
# later config. Must run before the prompt is drawn.
zinit snippet OMZL::git.zsh
zinit snippet OMZP::brew

# --- Turbo: OMZ plugin directories loaded ~0s after prompt.
# `OMZP::name` fetches the full plugin dir so multi-file plugins (macos)
# can find their helper scripts. `wait` = defer, `lucid` = quiet.
# NOTE: OMZP::fzf is intentionally NOT loaded. It runs `eval "$(fzf --zsh)"`,
# which 30-cli-tools.zsh already does eagerly, and doing it again here in turbo
# (after the prompt) would clobber the Ctrl-R binding Atuin sets in 35-atuin.zsh.
# Its one unique contribution, FZF_DEFAULT_COMMAND, now lives in 30-cli-tools.zsh.
zinit wait lucid for \
    OMZP::git \
    OMZP::bazel \
    OMZP::docker-compose \
    OMZP::eza \
    OMZP::ssh

# --- Turbo: community plugins.
# zsh-syntax-highlighting must load last; `atinit'zicompinit; zicdreplay'`
# triggers a single compinit right before it loads, replaying any compdef
# calls registered by snippets above.
# `_comp_options+=(globdots)` MUST run after zicompinit: compinit assigns
# _comp_options wholesale (see compinit line ~139), so appending earlier
# (e.g. in a zshrc.d file) gets clobbered. This makes tab-completion offer
# dotfiles without typing the leading dot, without affecting globbing.
zinit wait lucid light-mode for \
    atinit'zicompinit; zicdreplay; _comp_options+=(globdots); _tool_completions; _zcompdump_refresh' \
        zdharma-continuum/fast-syntax-highlighting \
    atload'_zsh_autosuggest_start' \
        zsh-users/zsh-autosuggestions \
    blockf \
        zsh-users/zsh-completions
