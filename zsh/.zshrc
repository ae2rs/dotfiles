########################################
# PROMPT + SHELL INITIALIZATION
########################################

# --- Starship prompt ---
eval "$(starship init zsh)"


########################################
# FZF INTEGRATION
########################################

# Set up fzf key bindings and fuzzy completion
source <(fzf --zsh)

########################################
# EDITOR SETTINGS
########################################

export EDITOR="nvim"


########################################
# NODE VERSION MANAGER (NVM)
########################################

export NVM_DIR="$HOME/.nvm"
# Load NVM if installed
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" --no-use


########################################
# YAZI FUNCTION (CD TO LAST DIR AFTER EXIT)
########################################

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


########################################
# ORBSTACK + GOPATH
########################################

# Load OrbStack integration if available
[ -f ~/.orbstack/shell/init2.zsh ] && source ~/.orbstack/shell/init2.zsh

# Add GOPATH/bin to PATH
if command -v go >/dev/null 2>&1; then
    export PATH="$PATH:$(go env GOPATH)/bin"
fi

# Tailscale shortcut
alias tailscale="/Applications/Tailscale.app/Contents/MacOS/Tailscale"

########################################
# OH MY ZSH
########################################

export ZSH="$HOME/.oh-my-zsh"
plugins=(git bazel brew docker eza fzf golang macos rust ssh sudo uv zsh-autosuggestions)
source $ZSH/oh-my-zsh.sh

########################################
# UTILS
########################################

export PATH="/opt/homebrew/opt/unzip/bin:$PATH"

# The next line updates PATH for the Google Cloud SDK.
if [ -f '/Users/lucas/Downloads/google-cloud-sdk/path.zsh.inc' ]; then . '/Users/lucas/Downloads/google-cloud-sdk/path.zsh.inc'; fi

# The next line enables shell command completion for gcloud.
if [ -f '/Users/lucas/Downloads/google-cloud-sdk/completion.zsh.inc' ]; then . '/Users/lucas/Downloads/google-cloud-sdk/completion.zsh.inc'; fi

export PATH="$HOME/.local/bin:$PATH"

########################################
# ALIASES & SHORT FUNCTIONS
########################################

# eza (better ls)
alias l='eza -l'
alias ll='eza -l --all'
alias ls='eza'
alias lz='lazygit'

# Spotify
alias spo='spotify_player'

# nvim shortcut (open current directory by default)
n() {
    nvim "$@" .
}

# NVM
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion

# Zoxide
eval "$(zoxide init zsh)"

