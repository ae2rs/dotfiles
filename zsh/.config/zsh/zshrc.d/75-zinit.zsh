# zinit plugin manager
# https://github.com/zdharma-continuum/zinit
ZINIT_HOME="${HOME}/.local/share/zinit/zinit.git"
source "${ZINIT_HOME}/zinit.zsh"

# --- Eager: OMZ libs/plugins that set up env (PATH/fpath/vars) used by
# later config. Must run before the prompt is drawn.
zinit snippet OMZL::git.zsh
zinit snippet OMZP::brew

# --- Turbo: OMZ plugin directories loaded ~0s after prompt.
# `OMZP::name` fetches the full plugin dir so multi-file plugins (macos)
# can find their helper scripts. `wait` = defer, `lucid` = quiet.
zinit wait lucid for \
    OMZP::git \
    OMZP::bazel \
    OMZP::docker \
    OMZP::docker-compose \
    OMZP::eza \
    OMZP::fzf \
    OMZP::kubectl \
    OMZP::rust \
    OMZP::ssh \
    OMZP::uv

# --- Turbo: community plugins.
# zsh-syntax-highlighting must load last; `atinit'zicompinit; zicdreplay'`
# triggers a single compinit right before it loads, replaying any compdef
# calls registered by snippets above.
zinit wait lucid light-mode for \
    atinit'zicompinit; zicdreplay' \
        zdharma-continuum/fast-syntax-highlighting \
    atload'_zsh_autosuggest_start' \
        zsh-users/zsh-autosuggestions \
    blockf \
        zsh-users/zsh-completions
