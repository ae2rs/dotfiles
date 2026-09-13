# --- Node (via Bun) ---
# Using Bun as the JS runtime/package manager; PATH set in ~/.zshrc

# pi-subagents resolves child Pi processes from process.execPath, which under Bun
# would re-enter through Pi's Node bundle. Pin it to the Bun wrapper instead.
export PI_SUBAGENT_PI_BINARY="$HOME/.local/bin/pi"

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
