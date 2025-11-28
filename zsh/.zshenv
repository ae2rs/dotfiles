. "$HOME/.cargo/env"

# Load secrets for all shells (needed for tools launched non-interactively)
if [[ -r "$HOME/.config/zsh/zshrc.d/99-secrets.zsh" ]]; then
  source "$HOME/.config/zsh/zshrc.d/99-secrets.zsh"
fi
