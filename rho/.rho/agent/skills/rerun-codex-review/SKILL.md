---
name: rerun-codex-review
description: Replace the Codex review on the current wesprint-io/monorepo PR by deleting the previous Codex review comment and its `@codex` trigger comment, then posting a new `@codex review this PR` comment that carries PR context and the already-settled findings. Use when asked to re-run, refresh or redo the Codex review.
---

# Re-run the Codex review

`.github/workflows/codex.yaml` posts the review as one PR comment from `github-actions[bot]` starting with `### Summary`; it is triggered by a comment containing `@codex`. Leave every other comment alone, including other `github-actions[bot]` comments (they start with `<!--`).

Codex sees only the diff, the PR title and body, and the trigger comment's body (as "Additional instructions"). It never reads other PR comments, so findings already answered in replies come back on every re-run unless the trigger comment names them.

1. `r=wesprint-io/monorepo; n=$(gh pr view --json number -q .number); me=$(gh api user -q .login)`
2. Find the old review and trigger comments:
   `gh api --paginate repos/$r/issues/$n/comments --jq ".[] | select((.user.login == \"github-actions[bot]\" and (.body | startswith(\"### Summary\"))) or (.user.login == \"$me\" and (.body | contains(\"@codex\")))) | .id"`
3. Before deleting anything, read the old reviews and the replies to them (`pr://<n>/comments`), and write the new trigger comment body to a file:
   - First line: `@codex review this PR`.
   - A few lines of context: what the PR does, where it sits in its stack, and what is out of scope (handled in another PR or ticket).
   - Every finding from earlier reviews that is settled, one bullet each, so Codex does not raise it again: fixed (name the commit by subject, since restacks change shas), or won't fix / documented / irrelevant, with the one-line reason.
   - Anything the user added when invoking the skill.
   - No line may be exactly `PROMPT_EOF`: the body is spliced into that heredoc.
4. Delete each comment found in step 2: `gh api -X DELETE repos/$r/issues/comments/<id>`
5. Post the trigger: `gh pr comment $n --repo $r --body-file <file>`
6. Verify by re-running step 2: only the new trigger comment remains.
