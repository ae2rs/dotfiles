# --- Node Version Manager (NVM) ---
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"

# --- Google Cloud SDK ---
if [ -f '/Users/lucas/Downloads/google-cloud-sdk/path.zsh.inc' ]; then
    . '/Users/lucas/Downloads/google-cloud-sdk/path.zsh.inc'
fi
if [ -f '/Users/lucas/Downloads/google-cloud-sdk/completion.zsh.inc' ]; then
    . '/Users/lucas/Downloads/google-cloud-sdk/completion.zsh.inc'
fi
