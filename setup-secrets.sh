#!/usr/bin/env bash
set -e

echo "Setting up secrets management..."

# Install pass-cli if not present
if ! command -v pass-cli >/dev/null; then
  echo "Installing pass-cli..."
  curl -fsSL https://proton.me/download/pass-cli/install.sh | bash
else
  echo "pass-cli already installed"
fi

# Fetch age private key from 1Password
AGE_KEY_FILE="$HOME/.config/age/keys.txt"

if [[ -f "$AGE_KEY_FILE" ]]; then
  read -p "Age key file already exists. Overwrite? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Skipping age key setup"
    exit 0
  fi
fi

echo "Fetching age private key from 1Password..."
mkdir -p "$(dirname "$AGE_KEY_FILE")"
pass-cli item view --vault-name Personal --item-id To6f5aZCaA7vaW0pNQaKKuWVW9QXmM7uS8nmkdooPXIRYODrtjfnVRzs7p7YgGYDRlYjEjeEhPX5fw8n1GuGVw== --output=json | jq '.item.content.extra_fields[1].content.Hidden' -r > "$AGE_KEY_FILE"
chmod 600 "$AGE_KEY_FILE"

echo "Age key successfully saved to $AGE_KEY_FILE"
echo "Secrets setup complete!"
