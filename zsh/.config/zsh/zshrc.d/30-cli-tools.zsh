# --- FZF ---
# Make Ctrl-R history search match exact terms instead of loose subsequences.
if [[ " ${FZF_CTRL_R_OPTS-} " != *" --exact "* ]]; then
  export FZF_CTRL_R_OPTS="${FZF_CTRL_R_OPTS:+${FZF_CTRL_R_OPTS} }--exact"
fi
source <(fzf --zsh)

# --- OrbStack ---
[ -f ~/.orbstack/shell/init2.zsh ] && source ~/.orbstack/shell/init2.zsh

# --- Tailscale ---
alias tailscale="/Applications/Tailscale.app/Contents/MacOS/Tailscale"

# --- Zoxide ---
eval "$(zoxide init zsh)"
