---
name: rerun-codex-review
description: Replace the Codex review on the current wesprint-io/monorepo PR by deleting the previous Codex review comment and its `@codex` trigger comment, then posting `@codex review this PR`. Use when asked to re-run, refresh or redo the Codex review.
---

# Re-run the Codex review

`.github/workflows/codex.yml` posts the review as one PR comment from `github-actions[bot]` starting with `### Summary`; it is triggered by a comment containing `@codex`. Leave every other comment alone, including other `github-actions[bot]` comments (they start with `<!--`).

1. `r=wesprint-io/monorepo; n=$(gh pr view --json number -q .number); me=$(gh api user -q .login)`
2. Find the old review and trigger comments:
   `gh api --paginate repos/$r/issues/$n/comments --jq ".[] | select((.user.login == \"github-actions[bot]\" and (.body | startswith(\"### Summary\"))) or (.user.login == \"$me\" and (.body | contains(\"@codex\")))) | .id"`
3. Delete each: `gh api -X DELETE repos/$r/issues/comments/<id>`
4. Trigger a new review: `gh pr comment $n --repo $r --body '@codex review this PR'`
5. Verify by re-running step 2: only the new trigger comment remains.
