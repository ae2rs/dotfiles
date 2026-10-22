# --- Node (via Bun) ---
# Using Bun as the JS runtime/package manager; PATH set in ~/.zshrc

# --- Google Cloud SDK ---
# Path needs to be available immediately; completion is lazy-loaded on first `gcloud` use.
if [ -f '/Users/lucas/Downloads/google-cloud-sdk/path.zsh.inc' ]; then
    . '/Users/lucas/Downloads/google-cloud-sdk/path.zsh.inc'
fi
gcloud() {
    unfunction gcloud
    [ -f '/Users/lucas/Downloads/google-cloud-sdk/completion.zsh.inc' ] && \
        . '/Users/lucas/Downloads/google-cloud-sdk/completion.zsh.inc'
    command gcloud "$@"
}

# --- Java ---
export CPPFLAGS="-I/opt/homebrew/opt/openjdk@17/include"
