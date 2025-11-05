# Unzip
export PATH="/opt/homebrew/opt/unzip/bin:$PATH"

# Local bin
export PATH="$HOME/.local/bin:$PATH"

# Go
if command -v go >/dev/null 2>&1; then
    export PATH="$PATH:$(go env GOPATH)/bin"
fi


