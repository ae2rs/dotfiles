---
name: linear
description: Read and write Linear tickets for the amoco workspace using the `linear` CLI. Covers viewing one or more issues, creating issues and sub-issues, and updating or commenting on them, following the Core/Backend (CBE) team conventions. Work-only — applies solely to the wesprint-io/monorepo and wesprint-io/infrastructure repos and their worktrees.
compatibility: Requires the `linear` CLI (v2.x) authenticated to the `amoco` workspace (`linear auth whoami` should print lucasdc@amo.co). No Pi MCP is involved — all access is through the CLI.
---

# Linear tickets (amoco workspace)

Linear is work-only tooling. Everything here goes through the `linear` CLI, which is
already authenticated (`linear auth whoami` → lucasdc@amo.co, workspace `amoco`).

This skill is loaded only inside the work repos and their worktrees — the `linear`
extension gates it on the cwd's git remote (`wesprint-io/monorepo` or
`wesprint-io/infrastructure`), so you will not see it elsewhere.

## Conventions

- **Team:** Core/Backend, key `CBE`. No default team is configured on this machine, so
  always pass `--team CBE` when creating an issue (unless the user names another team,
  e.g. `APPS`, `IOS`, `SRE`).
- **Assignee:** yourself by default → `-a self`. Only assign someone else when the user
  says so.
- **Title naming — pipe-separated hierarchy.** Each level appends ` | <detail>` to its
  parent's title, so a title reads as a breadcrumb of where it sits. From `CBE-3052`:
  - Epic (parent): `Reengagement SMS V2`
  - Direct sub-issue: `Reengagement SMS V2 | Targeting`
  - Direct sub-issue: `Reengagement SMS V2 | Design & Implement new SMS heuristics`
  - Sub-sub-issue: `Reengagement SMS V2 | Design & Implement new SMS heuristics | Add LiveActivity as a Channel`

  When creating a sub-issue, look up the parent's title first and prefix the new title
  with it. Cross-team children keep the epic prefix but live under their own team (e.g.
  `APPS-3627: Reengagement | Friendship Created Live Activity`).

## Reading tickets

- `linear issue view CBE-3052` — full details (title, state, priority, assignee, parent,
  sub-issues, description, comments). Add `--no-comments` to trim, `-j` for JSON.
- `linear issue view CBE-3052 -w` / `-a` — open in browser / Linear.app.
- `linear issue mine` — your unstarted issues; `--all-states` for everything.
- `linear issue query --team CBE --search "<term>" -s started` — structured search;
  repeatable `-s`/`-l`/`--team`, `-j` for JSON. See `linear issue query --help`.
- `linear issue id` — the issue for the current git branch (worktree-aware).

When the user gives several ticket IDs, view each one and summarize; don't dump raw
output unless they ask.

## Creating tickets

Prefer `--description-file` for anything with markdown; inline `-d` is fine for a line.

```sh
# Top-level issue in CBE, assigned to me
linear issue create --team CBE -a self -t "<Epic title>" \
  --description-file /tmp/desc.md -p 2

# Sub-issue under CBE-3052 — prefix the title with the parent's title
linear issue create --team CBE -a self --parent CBE-3052 \
  -t "Reengagement SMS V2 | <new detail>" -d "<one-line body>"
```

Useful flags: `-p 1..4` (1 = highest), `--estimate`, `-l <label>` (repeatable),
`--project`, `--milestone`, `--cycle`, `--due-date`, `--start` (start it after
creation). Run `linear issue create --help` for the full list.

For a batch of sub-tickets, create them one at a time under the same `--parent`, each
title carrying the shared prefix. Echo back the new IDs/URLs when done.

## Updating & commenting

- `linear issue update CBE-3060 -s "In Progress"` — change state, assignee (`-a`),
  priority, title, parent, labels, etc. (same flags as create).
- `linear issue start CBE-3060` — move to started and create/switch the git branch.
- `linear issue comment add CBE-3060 -b "<comment>"` (see `... comment add --help`).
- `linear issue relation ...` — dependencies/blocks between issues.

## Pitfalls

- Don't create without `--team CBE`; there is no configured default team and creation
  will fail or land in the wrong place.
- Don't invent a title prefix — read the parent (`linear issue view <parent>`) and reuse
  its exact title before appending ` | <detail>`.
- Confirm before creating multiple tickets or deleting anything; deletion
  (`linear issue delete`) is destructive.

## Verification

- After creating: `linear issue view <newId>` shows the expected team, assignee, parent,
  and title prefix.
- After updating: re-view the issue and confirm the changed field.
