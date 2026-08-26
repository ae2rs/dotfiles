# --- FZF ---
# Ctrl-R belongs to Atuin (35-atuin.zsh); fzf keeps Ctrl-T and Alt-C. This is
# kept so exact matching is restored if Atuin's binding is ever disabled.
if [[ " ${FZF_CTRL_R_OPTS-} " != *" --exact "* ]]; then
  export FZF_CTRL_R_OPTS="${FZF_CTRL_R_OPTS:+${FZF_CTRL_R_OPTS} }--exact"
fi
source <(fzf --zsh)

# Adopted from OMZP::fzf, which is no longer loaded (see 75-zinit.zsh).
if [[ -z "$FZF_DEFAULT_COMMAND" ]] && (( $+commands[fd] )); then
  export FZF_DEFAULT_COMMAND='fd --type f --hidden --exclude .git'
fi

# --- OrbStack ---
[ -f ~/.orbstack/shell/init2.zsh ] && source ~/.orbstack/shell/init2.zsh

# --- Tailscale ---
alias tailscale="/Applications/Tailscale.app/Contents/MacOS/Tailscale"

# --- Zoxide ---
eval "$(zoxide init zsh)"
