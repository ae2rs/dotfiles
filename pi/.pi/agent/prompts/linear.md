---
description: Load Linear (amoco) tooling and act on tickets — view IDs, or create/update from a request
argument-hint: "[CBE-1234 ...] | [create/update request]"
---
Bring Linear tooling into this session (it is not loaded by default).

1. **Scope check.** Run:
   `git remote get-url origin 2>/dev/null | sed -E 's#^(git@github.com:|https://github.com/)##; s#\.git$##'`
   Continue only if it is `wesprint-io/monorepo` or `wesprint-io/infrastructure` (this
   covers all their worktrees). Otherwise stop and say `/linear` is scoped to the
   monorepo and infrastructure repos only.

2. **Load the reference.** Read `~/.pi/agent/skills/linear/SKILL.md` for the `linear`
   CLI usage and our CBE ticket conventions (team `CBE`, assignee `self`, pipe-separated
   `Parent title | detail` naming). Follow those conventions.

3. **Act on the request:** ${ARGUMENTS:-No arguments given — run `linear issue mine` and summarize my open issues, then ask what I want to do.}
   - If it is one or more ticket IDs (e.g. `CBE-3052`), `linear issue view` each and give
     a concise summary; include sub-issues when relevant.
   - If it asks to create tickets, draft the title(s) using the naming convention (read
     the parent's title first for sub-issues), show me the plan, and create them with
     `--team CBE -a self` (plus `--parent` for sub-issues) after I confirm.
   - If it asks to update/comment, make the change with the CLI and re-view to confirm.

Echo back the resulting issue IDs and URLs.
