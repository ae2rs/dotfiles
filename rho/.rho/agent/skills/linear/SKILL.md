---
name: linear
description: Read and write Linear tickets for the amoco workspace through rho's linear:// resource. Covers viewing issues, creating issues and sub-issues, and updating or commenting on them, following the Core/Backend (CBE) team conventions. Work-only — applies solely to the wesprint-io/monorepo and wesprint-io/infrastructure repos and their worktrees.
compatibility: Requires the `linear` CLI (v2.x) on PATH and logged in to the `amoco` workspace (`linear auth whoami` prints lucasdc@amo.co); linear:// runs through its login. The profile must list `resources = ["linear"]`.
---

# Linear tickets (amoco workspace)

Linear is work-only. Only the `monorepo` and `infrastructure` profiles declare this
skill and mount `linear://`, so neither appears elsewhere.

Work through `linear://` with the ordinary tools, not the `linear` CLI. No JSON, no
`jq`, no description files, no `--help`.

## Requests

When invoked as `/skill:linear <request>`, act on it with the conventions below:

- **Ticket IDs** (e.g. `CBE-3052`): `read linear://CBE-3052` for each and give a short
  summary. Read sub-issues when they matter.
- **Create:** draft the title(s) with the naming convention (read the parent first for
  sub-issues), show the plan, and write `linear://new` once the user confirms.
- **Update or comment:** `edit` the issue, or write its `comment` target. The receipt
  says what changed.
- **Nothing asked:** `read linear://` (your open issues), summarise, and ask what to do.

Echo back the resulting issue IDs and URLs.

## Conventions

- **Team:** Core/Backend, key `CBE`. Always set `team:` on a new issue: `CBE` unless the
  user names another team (`APPS`, `IOS`, `SRE`, …).
- **Assignee:** yourself by default, `assignee: me`. Assign someone else only when the
  user says so.
- **Title naming — pipe-separated hierarchy.** Each level appends ` | <detail>` to its
  parent's title, so a title reads as a breadcrumb. From `CBE-3052`:
  - Epic (parent): `Reengagement SMS V2`
  - Direct sub-issue: `Reengagement SMS V2 | Targeting`
  - Sub-sub-issue: `Reengagement SMS V2 | Design & Implement new SMS heuristics | Add LiveActivity as a Channel`

  For a sub-issue, read the parent and reuse its exact title as the prefix.
  Cross-team children keep the epic prefix but live under their own team (e.g.
  `APPS-3627: Reengagement | Friendship Created Live Activity`).

## The issue document

`read linear://cbe-3052` (any case) gives front matter, then the description:

```
---
title: Reengagement SMS V2 | Targeting
team: CBE
state: In Progress
assignee: lucasdc
priority: High
project:
labels: Growth
parent: CBE-3052
due:
blocks:
blocked-by:
related: CBE-3061
links:
  - https://github.com/wesprint-io/monorepo/pull/123 PR 123
# read-only
url: https://linear.app/amoco/issue/CBE-3060
children:
  - CBE-3070 (Todo) Reengagement SMS V2 | Targeting | Cohorts
comments: 2, read linear://CBE-3060/comments
---
Description in markdown.
```

- `edit` it like a file. Only what changed is sent.
- `write` a partial document: a key left out stays as it is, and an empty value clears it.
- State, label, user and project names match in any case. A wrong one fails and lists
  the valid ones, so read the error rather than guessing again.
- `priority` is None, Urgent, High, Medium or Low. `due` is `YYYY-MM-DD`.
- `blocks`, `blocked-by` and `related` are comma-separated IDs. Removing one deletes
  that relation.
- `links` can only be added, one `  - <url> [title]` line each.
- Linear normalises markdown. When it rewrites a description, the receipt says so:
  read the issue again before the next edit.

## Creating tickets

Write a document to `linear://new`. `team` and `title` are required. The receipt gives
the new ID and URL.

```
---
team: CBE
title: Reengagement SMS V2 | <new detail>
assignee: me
parent: CBE-3052
priority: Medium
---
Why and what, in markdown.
```

The project is not copied from the parent. Set `project:` when it should have one.
For a batch of sub-tickets, write `linear://new` once per ticket, each title carrying
the shared prefix.

## Reading and listing

- `read linear://CBE-3052/comments` — the thread, replies under their comment.
- `write linear://CBE-3052/comment` — post a comment, in markdown.
- `ls linear://` or `read linear://` — your open issues, 50 at most.
- `read linear://?team=CBE&state=started&assignee=*&label=Growth&search=sms&limit=100`
  — others. `assignee` takes `*` (anyone), `none`, `me` or a name. `state` takes
  `open`, `all`, a type (`triage`, `backlog`, `unstarted`, `started`, `completed`,
  `canceled`) or a state name. `label` repeats.

## Still the CLI

Only for what `linear://` cannot do:

- `linear issue delete <ID>` — destructive; confirm with the user first.
- `linear issue start <ID>` — move it to started and create the git branch.
- `linear issue id` — the issue of the current git branch.
- Documents, cycles, initiatives and history: `linear api` with a GraphQL query on stdin.

## Pitfalls

- Never create without `team:`; there is no default team.
- Don't invent a title prefix: read the parent and reuse its exact title.
- Confirm before creating several tickets or deleting anything.
