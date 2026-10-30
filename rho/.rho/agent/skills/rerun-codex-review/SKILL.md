---
name: rerun-codex-review
description: Run the Codex review loop on the current wesprint-io/monorepo PR. Replace the previous Codex review comment and its `@codex` trigger comment with a new `@codex review this PR` comment that carries PR context and the already-settled findings, wait for the review, fix its findings, push, and re-trigger until Codex reports none. Never accepts a finding without asking the user. Use when asked to re-run, refresh or redo the Codex review, or to loop on Codex findings.
---

# Re-run the Codex review until it is clean

`.github/workflows/codex.yaml` posts the review as one PR comment from `github-actions[bot]` starting with `### Summary`; it is triggered by a comment containing `@codex`. A push does not trigger it. Leave every other comment alone, including other `github-actions[bot]` comments (they start with `<!--`).

Codex sees only the diff, the PR title and body, and the trigger comment's body (as "Additional instructions"). It never reads other PR comments, so findings already answered in replies come back on every re-run unless the trigger comment names them.

## Rules

- **Never accept a finding without asking.** Accepting means settling it without a code change: won't fix, documented, irrelevant, out of scope. Before listing one as settled that way, ask the user with the questionnaire tool, one question per finding, with your recommendation and the one-line reason. Earlier user answers stand for later rounds.
- Keep a running list of settled findings across rounds. Each round's trigger comment carries all of them, not only the newest.
- **Never block on a long wait.** Start the wait in step 7 with `bash` in the background, give the user one status line, and end the turn. Its exit notice resumes the loop.

## 1. Trigger a review

1. `r=wesprint-io/monorepo; n=$(gh pr view --json number -q .number); me=$(gh api user -q .login)`
2. Find the old review and trigger comments:
   `gh api --paginate repos/$r/issues/$n/comments --jq ".[] | select((.user.login == \"github-actions[bot]\" and (.body | startswith(\"### Summary\"))) or (.user.login == \"$me\" and (.body | contains(\"@codex\")))) | .id"`
3. Before deleting anything, read the old reviews and the replies to them (`pr://<n>/comments`), and write the new trigger comment body to a file:
   - First line: `@codex review this PR`.
   - A few lines of context: what the PR does, where it sits in its stack, and what is out of scope (handled in another PR or ticket).
   - Every settled finding from earlier reviews, one bullet each, so Codex does not raise it again: fixed (name the commit by subject, since restacks change shas), or accepted by the user (won't fix / documented / irrelevant), with the one-line reason.
   - Anything the user added when invoking the skill.
   - No line may be exactly `PROMPT_EOF`: the body is spliced into that heredoc.
4. Delete each comment found in step 2: `gh api -X DELETE repos/$r/issues/comments/<id>`
5. Post the trigger: `gh pr comment $n --repo $r --body-file <file>`
6. Verify by re-running step 2: only the new trigger comment remains. Record its `created_at` as `since`.

## 2. Wait for the review

7. Start this in the background (bash `timeout` 2700: the job's limit is 40 minutes), then end the turn. Each `bash` call is a fresh shell, so set `r`, `n` and `since` in the same call:

   ```bash
   until gh api --paginate repos/$r/issues/$n/comments \
     --jq ".[] | select(.user.login == \"github-actions[bot]\" and .created_at > \"$since\" and (.body | startswith(\"<!--\") | not)) | .id" | grep -q .; do
     sleep 30
   done
   ```

8. Read the new comment. If it is not a `### Summary` review (for example "The code review could not be generated."), report it and stop.

## 3. Work through the findings

9. If the review has no findings, stop: report the number of rounds, the commits pushed and the findings the user accepted.
10. Otherwise, for each finding, check it against the code. Do not trust it blindly.
    - Real and in scope: fix it.
    - Wrong, out of scope, or not worth fixing: ask the user (see Rules). Fix it if they say so.
    - Already settled but raised again: ask the user whether to reword its bullet or fix it.
11. Commit each fix as its own commit, run the checks that cover it, and push the branch.
12. Add every finding of this round to the settled list, then go back to step 1 with the updated context.
