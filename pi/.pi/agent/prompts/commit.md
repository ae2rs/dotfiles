---
description: Commit the working copy as one or more clean commits
---
Commit the current changes.

1. Run `git status` and `git diff` first. If the working copy contains changes that are
   not part of this task, leave them alone and say which ones you skipped.
2. Group the remaining changes into logical commits — one concern each.
3. Subject format: `<area>: <imperative, lowercase>`, where area is the config surface
   or package touched. Body only when the reason is not obvious from the diff.
4. Finish with `git status` clean of this task's changes.

Do not push, amend, rebase, or switch branches.
