#!/usr/bin/env bash
#
# Formats every language tracked in this repo. Run with --check to verify
# without writing, which is what a pre-commit hook or CI should call.
#
# Tools come from the Brewfile: prettier, stylua, shfmt, ruff, taplo.

set -eo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

# Skipped everywhere: files a tool rewrites on its own schedule, encrypted
# blobs, and vendored text. Git pathspecs, so they apply to every glob below.
EXCLUDED=(
	':!nvim/.config/nvim/lazy-lock.json'
	':!uv/.config/uv/uv-receipt.json'
	':!gh/.config/gh/*.yml'
	':!zsh/.config/zsh/secrets/*.yaml'
	':!nvim/.config/nvim/LICENSE.md'
)

usage() {
	echo "usage: ${0##*/} [--check]" >&2
	exit 2
}

fix=true
case ${1-} in
	'') ;;
	--check) fix=false ;;
	*) usage ;;
esac
[[ $# -le 1 ]] || usage

# taplo logs every file it visits at INFO; only its diagnostics are wanted here.
export RUST_LOG=error

if $fix; then
	prettier=(prettier --write --log-level warn)
	stylua=(stylua)
	shfmt=(shfmt --write)
	ruff=(ruff format --quiet)
	taplo=(taplo format)
else
	prettier=(prettier --check --log-level warn)
	stylua=(stylua --check)
	shfmt=(shfmt --diff)
	ruff=(ruff format --check --quiet)
	taplo=(taplo format --check --diff)
fi

# Runs one formatter over the tracked files it owns, or nothing at all when the
# repo has none of them. Usage: run <glob>... -- <command>...
run() {
	local globs=()
	while [[ $# -gt 0 && $1 != -- ]]; do
		globs+=("$1")
		shift
	done
	shift

	local files
	files=$(git ls-files -- "${globs[@]}" "${EXCLUDED[@]}")
	[[ -n $files ]] || return 0

	printf '%s\n' "$files" | tr '\n' '\0' | xargs -0 "$@"
}

# Every formatter runs even after one fails, so --check reports the full picture.
status=0
run '*.ts' '*.json' '*.md' '*.yaml' '*.yml' -- "${prettier[@]}" || status=1
run '*.lua' -- "${stylua[@]}" || status=1
run '*.sh' -- "${shfmt[@]}" || status=1
run '*.py' -- "${ruff[@]}" || status=1
run '*.toml' -- "${taplo[@]}" || status=1

exit $status
