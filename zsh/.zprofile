
# Avoid Homebrew calling /bin/ps (blocked in the Codex sandbox) by passing the shell name explicitly.
eval "$(/opt/homebrew/bin/brew shellenv zsh)"

# rho uses the local Pi fork with its RPC extension-host support.
export RHO_PI_PACKAGE_ROOT="${RHO_PI_PACKAGE_ROOT:-$HOME/perso/pi-rho/packages/coding-agent}"

# Added by Obsidian
export PATH="$PATH:/Applications/Obsidian.app/Contents/MacOS"
