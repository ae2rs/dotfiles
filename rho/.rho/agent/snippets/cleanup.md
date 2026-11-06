---
description: clean up what this session left behind before leaving it
---

Before I leave this session, clean up what it left behind. Touch only what this session or its merged work created, and ask before deleting anything you are unsure of.

- Remove git worktrees whose branch is merged into main. Never remove the main checkout or a worktree with uncommitted changes.
- Delete local branches already merged into main, and prune remote-tracking branches whose remote is gone.
- Remove scratch files and directories this session created outside the repository.
- Stop background processes this session started that are still running.

Then say in a few lines what you removed and what you kept, and why.
