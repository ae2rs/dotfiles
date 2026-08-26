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
# NOTE: OMZP::fzf is intentionally NOT loaded. It runs `eval "$(fzf --zsh)"`,
# which 30-cli-tools.zsh already does eagerly, and doing it again here in turbo
# (after the prompt) would clobber the Ctrl-R binding Atuin sets in 35-atuin.zsh.
# Its one unique contribution, FZF_DEFAULT_COMMAND, now lives in 30-cli-tools.zsh.
zinit wait lucid for \
    OMZP::git \
    OMZP::bazel \
    OMZP::docker \
    OMZP::docker-compose \
    OMZP::eza \
    OMZP::kubectl \
    OMZP::rust \
    OMZP::ssh \
    OMZP::uv

# --- Turbo: community plugins.
# zsh-syntax-highlighting must load last; `atinit'zicompinit; zicdreplay'`
# triggers a single compinit right before it loads, replaying any compdef
# calls registered by snippets above.
# `_comp_options+=(globdots)` MUST run after zicompinit: compinit assigns
# _comp_options wholesale (see compinit line ~139), so appending earlier
# (e.g. in a zshrc.d file) gets clobbered. This makes tab-completion offer
# dotfiles without typing the leading dot, without affecting globbing.
zinit wait lucid light-mode for \
    atinit'zicompinit; zicdreplay; _comp_options+=(globdots)' \
        zdharma-continuum/fast-syntax-highlighting \
    atload'_zsh_autosuggest_start' \
        zsh-users/zsh-autosuggestions \
    blockf \
        zsh-users/zsh-completions
