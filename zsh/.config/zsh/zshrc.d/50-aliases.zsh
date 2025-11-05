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

# --- Other tools ---
alias spo='spotify_player'
alias ghd='gh dash'
alias dc='docker compose'

# --- Work-specific ---
alias clip='/Users/lucas/work/monorepo/tools/clippy.py'
alias rfmt='/Users/lucas/work/monorepo/tools/rustfmt $(git ls-files | grep -E "\.rs\$")'

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
