# --- Atuin ---
# SQLite-backed shell history: unbounded retention, instant cross-terminal
# search, and flat shell-startup cost regardless of how large it grows.
#
# Must load AFTER 30-cli-tools.zsh so Atuin wins the Ctrl-R binding from
# fzf. OMZP::fzf is deliberately absent from 75-zinit.zsh for the same
# reason -- it re-runs `eval "$(fzf --zsh)"` in turbo, i.e. after this file,
# and would silently take Ctrl-R back.
#
# --disable-up-arrow: Ctrl-R is the only way into Atuin's search UI. Left to
# itself, `atuin init` also binds Up to that full-screen picker, so recalling
# the last command became type-nothing, look at a list, press Enter. Up is
# rebound below to read the same Atuin database non-interactively instead.
#
# Config (local-only, no sync) lives in ~/.config/atuin/config.toml.
eval "$(atuin init zsh --disable-up-arrow)"

# --- Up/Down: inline recall from Atuin's history ---
# Up drops the previous command straight onto the line, exactly like zsh's own
# up-line-or-history -- no UI, no second keystroke to accept it -- except the
# history it walks is Atuin's, so it spans every terminal and reaches as far
# back as the database goes rather than stopping at this session's $HISTFILE.
#
# Ctrl-P/Ctrl-N are deliberately left on zsh's own widgets, as the escape
# hatch back to plain session-local history.

# How deep Up can reach. Non-interactive `atuin search` de-duplicates, so this
# counts distinct commands, not raw history entries.
: ${ATUIN_INLINE_HISTORY_LIMIT:=1000}

typeset -ga _atuin_inline_items    # distinct commands, newest first
typeset -gi _atuin_inline_idx=0    # 0 = on the typed line, N = showing item N
typeset -g  _atuin_inline_draft=   # what was on the line before recall started
typeset -g  _atuin_inline_shown=   # last buffer these widgets wrote

# One `atuin search` per recall run, not per keypress. --print0 because a
# stored command can itself span lines, and --filter-mode global so Up ignores
# whatever filter_mode Ctrl-R is configured with.
_atuin_inline_load() {
    local cmd
    _atuin_inline_items=()
    while IFS= read -r -d $'\0' cmd; do
        _atuin_inline_items+=("$cmd")
    done < <(atuin search --limit "$ATUIN_INLINE_HISTORY_LIMIT" --print0 \
        --format '{command}' --filter-mode global 2>/dev/null)
    # Atuin prints a page oldest-first; Up wants the newest command first.
    (( $#_atuin_inline_items )) &&
        _atuin_inline_items=("${(Oa)_atuin_inline_items[@]}")
}

_atuin_inline_reset() {
    _atuin_inline_items=()
    _atuin_inline_idx=0
    _atuin_inline_draft=
    _atuin_inline_shown=
}

# A recall run continues only while the line still holds what we put there.
# Editing it starts a fresh run (and re-reads Atuin); merely moving the cursor
# mid-run does not.
_atuin_inline_active() {
    (( _atuin_inline_idx > 0 )) && [[ $BUFFER == "$_atuin_inline_shown" ]]
}

_atuin_inline_show() {
    BUFFER=$1
    CURSOR=${#BUFFER}
    _atuin_inline_shown=$1
    # zsh-autosuggestions only wraps widgets it knows by name, so its
    # suggestion for the previous line would otherwise linger over this one.
    # Dropping it is what it does for zsh's own history widgets anyway.
    unset POSTDISPLAY
}

atuin-inline-up() {
    # Inside a multiline command, Up moves between its lines first.
    if [[ $LBUFFER == *$'\n'* ]]; then
        zle up-line
        return
    fi
    if ! _atuin_inline_active; then
        _atuin_inline_draft=$BUFFER
        _atuin_inline_idx=0
        _atuin_inline_load
    fi
    # Empty or unreadable database: don't leave Up doing nothing at all.
    if (( ! $#_atuin_inline_items )); then
        zle up-line-or-history
        return
    fi
    (( _atuin_inline_idx >= $#_atuin_inline_items )) && return   # at the oldest
    (( ++_atuin_inline_idx ))
    _atuin_inline_show "${_atuin_inline_items[_atuin_inline_idx]}"
}

atuin-inline-down() {
    if [[ $RBUFFER == *$'\n'* ]]; then
        zle down-line
        return
    fi
    _atuin_inline_active || return
    (( --_atuin_inline_idx ))
    if (( _atuin_inline_idx == 0 )); then
        _atuin_inline_show "$_atuin_inline_draft"   # back to the typed line
    else
        _atuin_inline_show "${_atuin_inline_items[_atuin_inline_idx]}"
    fi
}

zle -N atuin-inline-up
zle -N atuin-inline-down

autoload -Uz add-zsh-hook
add-zsh-hook precmd _atuin_inline_reset

# Both arrow encodings, matching the pair `atuin init` binds for Ctrl-R:
# ^[[A is normal cursor-key mode, ^[OA is application mode.
bindkey -M emacs '^[[A' atuin-inline-up
bindkey -M emacs '^[OA' atuin-inline-up
bindkey -M emacs '^[[B' atuin-inline-down
bindkey -M emacs '^[OB' atuin-inline-down
