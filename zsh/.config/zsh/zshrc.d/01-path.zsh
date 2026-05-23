# Unzip
export PATH="/opt/homebrew/opt/unzip/bin:$PATH"

# Local bin
export PATH="$HOME/.local/bin:$PATH"

# Go
if command -v go >/dev/null 2>&1; then
    export PATH="$PATH:$(go env GOPATH)/bin"
fi

# Java
export PATH="/opt/homebrew/opt/openjdk@17/bin:$PATH"

# Bun (PATH + fpath must be set before compinit in 10-init.zsh)
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
fpath=("$BUN_INSTALL" $fpath)
