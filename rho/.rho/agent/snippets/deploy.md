---
description: squash-merge the infra PR and watch the redeploy
---

Merge the infrastructure PR and watch the redeploy with the deploy-monorepo skill, section 8. The PR is the one from this session, or else the PR for the current branch of ~/work/infrastructure. Running this snippet is my explicit go-ahead to merge it, which overrides the skill's rule against merging the infrastructure PR.

1. Pin the PR in `wesprint-io/infrastructure`: open, not a draft, base `main`, and not in a stack with an open PR before it. Record its number and `headRefOid`. Run `wait-pr-ci.sh` on that SHA. Stop and ask if the head moves or a check fails.
2. Resolve the targets from the PR's diff of `versions.go` (section 8.1). If `ReleaseHash` changed, or the PR changes more than image hashes, stop and ask me: `--require-change` only detects image changes.
3. Start the rollout monitor with `--require-change` and `--stability-seconds 300` before merging (section 8.2), so it captures the starting state.
4. Squash-merge only this PR at the pinned head: `gh pr merge <n> --repo wesprint-io/infrastructure --squash --match-head-commit <sha>`. Re-query it, require `state: MERGED`, and record `mergeCommit.oid`. If the merge fails, cancel the monitor and report.
5. Start `watch-infrastructure-deploy.sh` for the merge SHA (section 8.3), give me one status line, and end the turn. If it keeps waiting after the run has ended, check `gh api repos/wesprint-io/infrastructure/actions/runs?branch=main&event=push` directly. Judge restarts and report when both runs have exited (sections 8.4 and 8.5).
