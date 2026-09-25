# Avoid double-loading when sourced from multiple entry points
if [[ -n "${ZSH_SECRETS_LOADED:-}" ]]; then
  return
fi

# Set age key location for sops
export SOPS_AGE_KEY_FILE="$HOME/.config/age/keys.txt"

# .zshenv runs before .zprofile puts Homebrew on PATH, so fall back to its
# absolute path. The guard is set only once sops is found, so a later pass
# from .zshrc can still load the secrets.
_sops=${commands[sops]:-/opt/homebrew/bin/sops}
if [[ -x $_sops ]]; then
  ZSH_SECRETS_LOADED=1
  for _file in "$HOME/.config/zsh/secrets"/*.yaml(N); do
    set -a
    eval "$("$_sops" -d --output-type dotenv "$_file" 2>/dev/null)"
    set +a
  done
fi
unset _sops _file
