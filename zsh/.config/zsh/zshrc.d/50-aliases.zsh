########################################
# ALIASES & FUNCTIONS
########################################

# --- eza (better ls) ---
alias l='eza -l'
alias ll='eza -l --all'
alias ls='eza'

# --- Git & Docker tools ---
alias lz='lazygit'
alias lzd='lazydocker'

# Create GitHub PRs with title
ghp() {
    if [ $# -eq 0 ]; then
        echo "Error: Please provide a PR title"
        return 1
    fi

    local title="$*"

    # Check format: prefix: description
    if ! echo "$title" | grep -qE '^[a-z0-9-]+: [-a-z0-9_ ]+$'; then
        echo "Error: Title must be in format: {short-attached-name}: {lowercase description}"
        echo "Example: add-feature: implements new user authentication system"
        return 1
    fi

    # Extract description part (after ": ")
    local desc="${title#*: }"
    if [ ${#desc} -gt 80 ]; then
        echo "Error: Description must be 80 characters or less (current: ${#desc})"
        return 1
    fi

    gh pr create --title "$title"
}

ghpd() {
    if [ $# -eq 0 ]; then
        echo "Error: Please provide a PR title"
        return 1
    fi

    local title="$*"

    # Check format: prefix: description
    if ! echo "$title" | grep -qE '^[a-z0-9-]+: [-a-z0-9_ ]+$'; then
        echo "Error: Title must be in format: {short-attached-name}: {lowercase description}"
        echo "Example: add-feature: implements new user authentication system"
        return 1
    fi

    # Extract description part (after ": ")
    local desc="${title#*: }"
    if [ ${#desc} -gt 80 ]; then
        echo "Error: Description must be 80 characters or less (current: ${#desc})"
        return 1
    fi

    gh pr create --draft --title "$title"
}

# --- Other tools ---
alias spo='spotify_player'
alias ghd='gh dash'
alias dc='docker compose'
alias ai='aichat'

# --- Work-specific ---
alias clip='(cd /Users/lucas/work/monorepo/ && /Users/lucas/work/monorepo/tools/clippy.py)'
alias rfmt='/Users/lucas/work/monorepo/tools/rustfmt $(git ls-files | grep -E "\.rs\$")'
alias xcode='(cd /Users/lucas/work/monorepo/ && bazel run //iosapp/Apps/Location:xcodeproj && xed iosapp/Apps/Location/Location.xcodeproj)'

# --- Notes ---
alias todo='nvim /Users/lucas/Library/Mobile\ Documents/iCloud~md~obsidian/Documents/Notes/TODO.md'
alias notes='nvim /Users/lucas/Library/Mobile\ Documents/iCloud~md~obsidian/Documents/Notes/'

# --- nvim shortcut ---
n() {
    nvim "$@" .
}

# --- Yazi (file manager with cd on exit) ---
y() {
    local tmp
    tmp=$(mktemp -t "yazi-cwd.XXXXXX")
    yazi "$@" --cwd-file="$tmp"
    if [[ -s "$tmp" ]]; then
        local cwd
        cwd=$(<"$tmp")
        [[ -n "$cwd" && "$cwd" != "$PWD" ]] && cd "$cwd"
    fi
    rm -f -- "$tmp"
}
