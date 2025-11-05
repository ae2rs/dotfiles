# ~/.zshrc - Main configuration file
# All settings are loaded from ~/.config/zsh/zshrc.d/

# Source all configuration files in zshrc.d/ directory
if [[ -d "$HOME/.config/zsh/zshrc.d" ]]; then
  for config_file in "$HOME/.config/zsh/zshrc.d"/*.zsh(N); do
    source "$config_file"
  done
fi
