# Global instructions

Deliberately small. Add things here once they have proven themselves across more
than one project — project-specific rules belong in that project's `AGENTS.md`.

## Commits

- Subject format is `<area>: <imperative, lowercase>` — e.g. `atuin: disable the ai feature`,
  `nvim: forward option+backspace from :terminal to zsh`. The area is the config surface or
  package being touched, not a path.
- One logical change per commit. Never fold unrelated or pre-existing edits into a commit.
- Branch off `main` for anything non-trivial; merge and delete the branch when done.
- Do not amend or rebase existing commits without asking.

## Working style

- Inspect the working copy before making changes; if it is already dirty, keep those
  changes out of the commit.
- Prefer editing an existing file over adding a new one.
