---
description: squash-merge this monorepo PR, open the infra bump PR early, fill in the hashes after the release
---

Deploy the current monorepo PR with the deploy-monorepo skill, up to its section 7 hand-off, in this order:

1. Pin the PR and wait for green CI (sections 1 and 2). Running this snippet is my go-ahead to squash-merge it at the pinned head, so skip the merge question. Still stop and ask if the head moves, a check fails, or a stack predecessor is still open. Merge only this PR (section 3) and record its merge SHA.
2. Start `watch-backend-release.sh` for the merge SHA in the background at once.
3. While the release runs, choose the services from the monorepo diff and `WithImage` (section 5). Open the infrastructure PR as a draft (section 6) with each chosen hash in `versions.go` set to `""`. Skip the smoke test for this commit. In the body, mark the release run and image hash as pending.
4. When the release finishes, check that its images cover every chosen service, or stop and ask. Set the hashes to its `metadataHash`, run `gofmt` and the smoke test, then commit and push. Update the body with `gh pr edit` and mark the PR ready with `gh pr ready`.
5. Wait for the infrastructure CI and hand off (section 7). Never merge the infrastructure PR.
