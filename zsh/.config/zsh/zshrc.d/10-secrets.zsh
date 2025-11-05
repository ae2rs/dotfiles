# Load all encrypted secrets YAML files in ~/.config/zsh/secrets

if command -v sops >/dev/null; then
  _secrets_dir="$HOME/.config/zsh/secrets"
  if [[ -d "$_secrets_dir" ]]; then
    for _file in "$_secrets_dir"/*.yaml; do
      [[ -e "$_file" ]] || continue
      set -a
      eval "$(sops -d --output-type dotenv "$_file" 2>/dev/null)"
      set +a
    done
  fi
fi
