# ~/.zshrc - Main configuration file
# All settings are loaded from ~/.config/zsh/zshrc.d/

# Source all configuration files in zshrc.d/ directory
if [[ -d "$HOME/.config/zsh/zshrc.d" ]]; then
  for config_file in "$HOME/.config/zsh/zshrc.d"/*.zsh(N); do
    source "$config_file"
  done
fi

# bun completions
[ -s "/Users/lucas/.bun/_bun" ] && source "/Users/lucas/.bun/_bun"

# bun
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

# Added by Antigravity
export PATH="/Users/lucas/.antigravity/antigravity/bin:$PATH"

# opencode
export PATH=/Users/lucas/.opencode/bin:$PATH

# >>> forge initialize >>>
# !! Contents within this block are managed by 'forge zsh setup' !!
# !! Do not edit manually - changes will be overwritten !!

# Add required zsh plugins if not already present
if [[ ! " ${plugins[@]} " =~ " zsh-autosuggestions " ]]; then
    plugins+=(zsh-autosuggestions)
fi
if [[ ! " ${plugins[@]} " =~ " zsh-syntax-highlighting " ]]; then
    plugins+=(zsh-syntax-highlighting)
fi

# Load forge shell plugin (commands, completions, keybindings) if not already loaded
if [[ -z "$_FORGE_PLUGIN_LOADED" ]]; then
    eval "$(forge zsh plugin)"
fi

# Load forge shell theme (prompt with AI context) if not already loaded
if [[ -z "$_FORGE_THEME_LOADED" ]]; then
    eval "$(forge zsh theme)"
fi

# Editor for editing prompts (set during setup)
# To change: update FORGE_EDITOR or remove to use $EDITOR
export FORGE_EDITOR="nvim"
# <<< forge initialize <<<
