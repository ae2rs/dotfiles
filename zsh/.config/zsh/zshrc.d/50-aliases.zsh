########################################
# ALIASES & FUNCTIONS
########################################

# --- eza (better ls) ---
# -a shows dotfiles (like `ls -A`); use -aa to also show . and ..
alias l='eza -la'
alias ll='eza -alh'
alias ls='eza -a'

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
# Lets `uv add pkg[extra]` through without quoting.
alias uv='noglob uv'

# --- Claude ---
alias c="claude"
alias cr='c --resume'

alias r='rho'
alias rr='rho --resume'

# --- Work-specific ---
# Clippy, scoped. Fires the same bazel invocation as tools/clippy.py (so it shares
# the action cache with the editor's clippy), but lets us aim it at less than the
# whole Rust tree:
#   clip                    every Rust package (//rs/...)
#   clip rs/engine          that directory, recursively (//rs/engine/...)
#   clip rs/engine/foo.rs   the bazel package owning that file (//rs/engine:all)
#   clip //rs/foo:bar       target patterns are passed through untouched
#   clip -d                 the packages owning every .rs file changed vs. origin/HEAD
# Paths and targets can be mixed; any other -flag is forwarded to bazel.
clip() {
    emulate -L zsh

    local root
    root=$(git rev-parse --show-toplevel 2>/dev/null) || {
        print -u2 "clip: not in a git repository"
        return 1
    }
    local bazel=$root/tools/rust-editor-support/bazel-real
    [[ -x $bazel ]] || {
        print -u2 "clip: $root does not look like the monorepo"
        return 1
    }

    local -a targets flags paths
    local diff_mode=0

    while (( $# )); do
        case $1 in
            -h|--help)
                print "usage: clip [-d] [bazel flags] [dir|file|//target]..."
                print "  (no args)  lint every Rust package (//rs/...)"
                print "  dir        lint that directory recursively"
                print "  file       lint the bazel package owning it"
                print "  //target   passed through to bazel untouched"
                print "  -d         lint the packages of .rs files changed vs origin/HEAD"
                return 0
                ;;
            -d|--diff) diff_mode=1 ;;
            //*|@*|:*) targets+=($1) ;;
            -*)        flags+=($1) ;;
            *)         paths+=(${1:A}) ;;
        esac
        shift
    done

    if (( diff_mode )); then
        local base f
        base=$(git -C $root symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null) || base=origin/main
        base=$(git -C $root merge-base HEAD $base 2>/dev/null) || base=HEAD
        for f in ${(f)"$(git -C $root diff --name-only --diff-filter=d $base -- '*.rs'; git -C $root ls-files --others --exclude-standard -- '*.rs')"}; do
            paths+=($root/$f)
        done
        (( $#paths )) || { print -u2 "clip: no changed .rs files"; return 0 }
    fi

    local abs rel pkg
    for abs in $paths; do
        [[ -e $abs ]] || { print -u2 "clip: no such file or directory: $abs"; return 1 }
        [[ $abs == $root || $abs == $root/* ]] || { print -u2 "clip: outside the monorepo: $abs"; return 1 }
        rel=${${abs#$root}#/}
        if [[ -d $abs ]]; then
            # A directory means everything under it, subpackages included.
            targets+=("//${rel:-rs}/...")
        else
            # A file means the one package that owns it: walk up to its BUILD.bazel.
            pkg=${rel:h}
            while [[ $pkg != . && ! -f $root/$pkg/BUILD.bazel ]]; do
                pkg=${pkg:h}
            done
            [[ $pkg == . ]] && pkg=""
            [[ -f $root/$pkg/BUILD.bazel ]] || {
                print -u2 "clip: no BUILD.bazel above $rel"
                return 1
            }
            targets+=("//${pkg}:all")
        fi
    done

    targets=(${(u)targets})
    (( $#targets )) || targets=("//rs/...")

    # bazel is asked for JSON diagnostics (that is what makes the cache shared with
    # the editor); this unwraps them back into the rendered, ANSI-coloured form.
    local render='import json,sys
for line in sys.stdin:
    if line[:1] == "{":
        try:
            sys.stdout.write(json.loads(line)["rendered"] + "\n")
            continue
        except Exception:
            pass
    sys.stderr.write(line)'

    print -u2 "clip: ${(j: :)targets}"
    (
        cd $root || exit 1
        $bazel --bazelrc=tools/clippy.bazelrc build \
            --@rules_rust//rust/settings:error_format=json \
            --@rules_rust//rust/settings:clippy_error_format=json \
            --@rules_rust//:clippy_flags=--json=diagnostic-rendered-ansi \
            --color=yes \
            $flags $targets 2>&1 >/dev/null | python3 -u -c $render
        exit ${pipestatus[1]}
    )
}
alias rfmt='/Users/lucas/work/monorepo/tools/rustfmt $(git ls-files "*.rs")'
alias protofmt='find . -regex ".*\.proto" | xargs clang-format --style Google --assume-filename .proto -i'
alias bazelfmt='buildifier -r .'
alias webfmt="pnpm -r --filter='!sugar' lint --fix"
alias allfmt='rfmt && protofmt && bazelfmt'
alias allunused='./tools/unused_imports.py && ./tools/proto_unused_imports.py'
alias allowners='bazel run //tools/owners -- generate && bazel run //tools/owners -- format'
alias devlocal='(cd /Users/lucas/work/monorepo/rs/engine/dev-local/ && docker compose up -d) && bazel run //rs/engine/dev-local'
devkill() {
    local pid
    pid=$(pgrep -f dev-local/process-compose.yml | head -n 1)
    [[ -n $pid ]] || { print -u2 "devkill: dev-local is not running"; return 1 }
    kill -9 $pid
}

pglocal() {
    local PGDIR="/Users/lucas/work/monorepo/rs/engine/dev-local/postgres"
    { docker start dev-local-postgres 2>/dev/null || \
      docker run -d --name dev-local-postgres \
        -p 5432:5432 \
        -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=password -e POSTGRES_DB=postgres \
        -e PGDATA=/var/lib/postgresql/data/pgdata \
        -v dev-local-pgdata:/var/lib/postgresql/data \
        -v "$PGDIR/init:/seed/init:ro" \
        -v "$PGDIR/migrations:/seed/migrations:ro" \
        -v "$PGDIR/testdata:/seed/testdata:ro" \
        postgis/postgis:16-3.4 \
        -c max_connections=1000 -c wal_level=logical \
        -c max_wal_senders=64 -c max_replication_slots=64; } && \
    docker exec -e PGPASSWORD=password dev-local-postgres sh -ec '
      until pg_isready -q -U postgres; do echo "waiting for postgres..."; sleep 0.5; done
      fail=0
      for d in init migrations testdata; do
        echo "=== postgres $d ==="
        for f in $(ls /seed/$d/*.sql 2>/dev/null | sort); do
          echo "--- $f"
          out=$(psql -U postgres -d postgres -v ON_ERROR_ROLLBACK=on -f "$f" 2>&1) || true
          bad=$(echo "$out" | grep -E "ERROR:" | grep -Eiv "already exists|duplicate key value" || true)
          if [ -n "$bad" ]; then echo "$bad"; echo "PHASE $d FAILED on $f"; fail=1; fi
        done
      done
      if [ "$fail" -eq 0 ]; then echo "postgres ready on localhost:5432 (postgres / password)"; fi
      exit "$fail"'
}

# Connect to a production Cloud SQL instance as postgres: pg <name> [psql args...]
pg() {
    emulate -L zsh
    local infra=/Users/lucas/work/infrastructure
    local -a names=($infra/production/secrets/cloudsql/*-root-password(N:t:s/-root-password//))
    if (( $# < 1 )) || (( ! ${names[(Ie)$1]} )); then
        print -u2 "usage: pg <name> [psql args...]"
        print -u2 "  names: ${(j: :)names}"
        return 1
    fi
    local name=$1
    shift

    local password
    password=$(cd $infra && go run cmd/tools/secret/main.go decrypt \
        --input production/secrets/cloudsql/$name-root-password) || return 1
    PGPASSWORD=$password psql --host=$name-cloud-sql.cloudsql --port=5432 \
        --dbname=postgres --username=postgres "$@"
}
alias devclean='docker ps -q | xargs -r docker stop && docker ps -aq | xargs -r docker rm && docker volume ls -q | xargs -r docker volume rm'
unalias xcode 2>/dev/null
function xcode {
  local root
  root=$(git rev-parse --show-toplevel 2>/dev/null)
  [[ -d $root/iosapp/Apps ]] || root=/Users/lucas/work/monorepo
  (cd "$root" && bazel run //iosapp/Apps:xcodeproj && xed iosapp/Apps/Apps.xcodeproj)
}
alias lspmux_restart='launchctl kickstart -k gui/$(id -u)/org.codeberg.p2502.lspmux'
alias nuke_bazel='sudo rm -rf bazel-bin bazel-monorepo bazel-out bazel-testlogs /private/var/tmp/_bazel_rust_tools /var/tmp/_bazel_lucas && sudo find /private/var/tmp -maxdepth 1 \( -name "_bazel_*" -o -name "*_output_base" \) -exec rm -rf {} +'

nuke_disk() {
    echo "Nuking disk caches...\n"

    # ── Bazel (one sudo invocation for both the rm and the find) ───────────────
    echo "Bazel..."
    sudo sh -c '
      rm -rf "$@"
      find /private/var/tmp -maxdepth 1 \( -name "_bazel_*" -o -name "*_output_base" \) \
        -exec rm -rf {} + 2>/dev/null
    ' sh bazel-bin bazel-monorepo bazel-out bazel-testlogs \
      /private/var/tmp/_bazel_rust_tools /var/tmp/_bazel_lucas \
      ~/Library/Caches/bazel ~/Library/Caches/go-build

    # ── Rust target/ dirs (only next to a Cargo.toml, never blind) ─────────────
    echo "Rust target/ dirs..."
    find ~/perso ~/work -maxdepth 6 -name "Cargo.toml" -not -path "*/target/*" 2>/dev/null \
      | while read f; do
          dir=$(dirname "$f")
          if [ -d "$dir/target" ]; then
            rm -rf "$dir/target"
            echo "    cleaned: $dir/target"
          fi
        done

    # ── Cargo registry cache (keeps src/ for IDE lookups) ──────────────────────
    echo "Cargo registry cache..."
    rm -rf ~/.cargo/registry/cache

    # ── Node / Bun / uv ────────────────────────────────────────────────────────
    echo "npm / Bun / uv caches..."
    npm cache clean --force 2>/dev/null
    rm -rf ~/.npm ~/.bun/install/cache ~/.cache/uv

    # ── Xcode ──────────────────────────────────────────────────────────────────
    echo "Xcode DerivedData + unavailable simulators..."
    rm -rf ~/Library/Developer/Xcode/DerivedData
    xcrun simctl delete unavailable 2>/dev/null

    echo "\nDone! Run 'df -h /' to verify."
  }

# --- Notes ---
alias todo='(cd /Users/lucas/Documents/notes/ && nvim TODO.md) '
alias notes='(cd /Users/lucas/Documents/notes/ && nvim)'

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

# --- Others ---
alias pwdc='pwd | tr -d "\r" | pbcopy'
alias ipcp='ipconfig getifaddr en0 | tr -d "\n" | pbcopy'
