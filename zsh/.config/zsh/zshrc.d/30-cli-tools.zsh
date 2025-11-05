# --- FZF ---
source <(fzf --zsh)

# --- OrbStack ---
[ -f ~/.orbstack/shell/init2.zsh ] && source ~/.orbstack/shell/init2.zsh

# --- Tailscale ---
alias tailscale="/Applications/Tailscale.app/Contents/MacOS/Tailscale"

# --- Zoxide ---
eval "$(zoxide init zsh)"


