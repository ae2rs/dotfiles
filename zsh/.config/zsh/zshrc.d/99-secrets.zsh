# Load once per process tree: the guard is exported along with the secrets, so
# child shells inherit both and skip the decrypt. It also stops the second pass
# from the zshrc.d loop in .zshrc.
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
  set -a
  ZSH_SECRETS_LOADED=1
  eval "$("$_sops" -d --output-type dotenv "$HOME/.config/zsh/secrets/env.yaml" 2>/dev/null)"
  set +a
fi
unset _sops
