# ~/.zshrc - Main configuration file
# All settings are loaded from ~/.config/zsh/zshrc.d/

# Source all configuration files in zshrc.d/ directory
if [[ -d "$HOME/.config/zsh/zshrc.d" ]]; then
  for config_file in "$HOME/.config/zsh/zshrc.d"/*.zsh(N); do
    source "$config_file"
  done
fi

# bun: PATH, BUN_INSTALL, and fpath autoload for _bun are configured in
# ~/.config/zsh/zshrc.d/01-path.zsh so they're set before compinit.

# Added by Antigravity
export PATH="/Users/lucas/.antigravity/antigravity/bin:$PATH"

# opencode
export PATH=/Users/lucas/.opencode/bin:$PATH

# Abacus AI CLI
export PATH="/Users/lucas/.abacusai/bin:$PATH"
