---
description: squash-merge this monorepo PR, post the bump, open and merge the infra bump PR, watch the redeploy
---

Deploy the current monorepo PR end to end with the deploy-monorepo skill, in this order:

1. Pin the PR and wait for green CI (sections 1 and 2). Running this snippet is my go-ahead to squash-merge it at the pinned head, so skip the merge question. Still stop and ask if the head moves, a check fails, or a stack predecessor is still open. Merge only this PR (section 3) and record its merge SHA.
2. Start `watch-backend-release.sh` for the merge SHA in the background at once.
3. While the release runs, choose the services from the monorepo diff and `WithImage`, and post the bump message in #backend-release (section 5). Then open the infrastructure PR as a draft (section 6) with each chosen hash in `versions.go` set to `""`. Skip the smoke test for this commit. In the body, mark the release run and image hash as pending.
4. When the release finishes, check that its images cover every chosen service, or stop and ask. Set the hashes to its `metadataHash`, run `gofmt` and the smoke test, then commit and push. Then `edit` `pr://wesprint-io/infrastructure/<n>`: update the description and set `draft: false` in one write.
5. Wait for the infrastructure CI, merge the infrastructure PR and watch the redeploy (sections 7 and 8). Add the check reaction to the bump message once the deployment succeeds (section 8.6).
