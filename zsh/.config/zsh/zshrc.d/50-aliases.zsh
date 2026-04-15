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

gcoo() {
    if [[ $# -lt 1 || $# -gt 2 ]]; then
        echo "Usage: gcoo <branch|remote/branch> [local-branch]"
        return 1
    fi

    git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "Error: not in a git repository"; return 1; }

    local input_ref="$1"
    local remote="origin"
    local branch="$input_ref"
    local remote_candidate="${input_ref%%/*}"

    if [[ "$input_ref" == */* ]] && git remote get-url "$remote_candidate" >/dev/null 2>&1; then
        remote="$remote_candidate"
        branch="${input_ref#*/}"
    fi

    if [[ -z "$branch" ]]; then
        echo "Error: expected <branch> or <remote>/<branch>, got: $input_ref"
        return 1
    fi

    local remote_ref="$remote/$branch"

    local local_branch="${2:-$branch}"

    if git show-ref --verify --quiet "refs/heads/$local_branch"; then
        echo "Error: local branch already exists: $local_branch"
        return 1
    fi

    git fetch "$remote" "$branch" || return 1
    git switch --track --create "$local_branch" "$remote_ref" || return 1
    git pull --ff-only || return 1
}

# Create GitHub PRs with title
ghp() {
    if [ $# -eq 0 ]; then
        echo "Error: Please provide a PR title"
        return 1
    fi

    local title="$*"

    gh pr create --title "$title"
}

ghpd() {
    if [ $# -eq 0 ]; then
        echo "Error: Please provide a PR title"
        return 1
    fi

    local title="$*"

    gh pr create --draft --title "$title"
}

# --- Other tools ---
alias spo='spotify_player'
alias ghd='gh dash'
alias dc='docker compose'
alias ai='aichat'
alias c='codex'
alias cr='codex resume'

# --- Work-specific ---
clip() {
    local root
    root=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "Error: not in a git repository"; return 1; }
    (cd "$root" && "$root/tools/clippy.py")
}
alias rfmt='/Users/lucas/work/monorepo/tools/rustfmt $(git ls-files | grep -E "\.rs\$")'
alias protofmt='find . -regex ".*\.proto" | xargs clang-format --style Google --assume-filename .proto -i'
alias bazelfmt='buildifier -r .'
alias webfmt="pnpm -r --filter='!sugar' lint --fix"
alias allfmt='rfmt && protofmt && bazelfmt'
alias allunused='./tools/unused_imports.py && ./tools/proto_unused_imports.py'
alias devlocal='(cd /Users/lucas/work/monorepo/rs/engine/dev-local/ && docker compose up -d) && bazel run //rs/engine/dev-local'
alias devkill="kill -9 $(ps aux | pgrep -fl dev-local/process-compose.yml | awk 'NR==1 {print $1}')"
alias devclean='docker ps -q | xargs -r docker stop && docker ps -aq | xargs -r docker rm && docker volume ls -q | xargs -r docker volume rm'
alias xcode='(cd /Users/lucas/work/monorepo/ && bazel run //iosapp/Apps/Location:xcodeproj && xed iosapp/Apps/Location/Location.xcodeproj)'
alias lspmux_restart='launchctl kickstart -k gui/$(id -u)/org.codeberg.p2502.lspmux'
alias nuke_bazel='sudo rm -rf bazel-bin bazel-monorepo bazel-out bazel-testlogs /private/var/tmp/_bazel_rust_tools && sudo find /private/var/tmp -maxdepth 1 \( -name "_bazel_*" -o -name "*_output_base" \) -exec rm -rf {} +'

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
