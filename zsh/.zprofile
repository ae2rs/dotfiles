
# Avoid Homebrew calling /bin/ps (blocked in the Codex sandbox) by passing the shell name explicitly.
eval "$(/opt/homebrew/bin/brew shellenv zsh)"

# Added by Obsidian
export PATH="$PATH:/Applications/Obsidian.app/Contents/MacOS"
