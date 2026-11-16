---
name: rerun-codex-review
description: Run the Codex review loop on the current wesprint-io/monorepo PR. Fold every earlier Codex review comment and `/codex` trigger comment, post a new `/codex review this PR` comment that carries PR context and the already-settled findings, wait for the review, fix its findings, push, and re-trigger until Codex reports none. Never accepts a finding without asking the user. Use when asked to re-run, refresh or redo the Codex review, or to loop on Codex findings.
---

# Re-run the Codex review until it is clean

`.github/workflows/codex.yaml` posts the review as one PR comment from `github-actions[bot]` whose first line is `<!-- codex-review -->`, followed by the review (`### Summary` ...) or by "The code review could not be generated.". A comment, review or review comment whose body starts with `/codex` triggers it, and so does a non-draft PR being opened, reopened or marked ready; a push does not. Comment events run the workflow from `main`, so read its trigger rules there (`git show origin/main:.github/workflows/codex.yaml`), not in the PR's checkout.

`@codex` is deprecated: it starts no review, only a deprecation notice from `github-actions[bot]` and a "create a Codex account" reply from `chatgpt-codex-connector[bot]`. Never write `@codex` anywhere in a trigger body. Leave every other comment alone, including other `github-actions[bot]` comments (they start with a different `<!--` marker) and the replies to reviews.

Codex sees only the diff, the PR title and body, and the trigger comment's body (as "Additional instructions"). It never reads other PR comments, so findings already answered in replies come back on every re-run unless the trigger comment names them.

## Rules

- **Never accept a finding without asking.** Accepting means settling it without a code change: won't fix, documented, irrelevant, out of scope. Before listing one as settled that way, ask the user with the questionnaire tool, one question per finding, with your recommendation and the one-line reason. Earlier user answers stand for later rounds.
- Keep a running list of settled findings across rounds. Each round's trigger comment carries all of them, not only the newest.
- **Never block on a long wait.** Start the wait in step 7 with `bash` in the background, give the user one status line, and end the turn. Its exit notice resumes the loop.

## 1. Trigger a review

1. `r=wesprint-io/monorepo; n=$(gh pr view --json number -q .number); me=$(gh api user -q .login)`
2. Find the comments to fold: old reviews, old triggers (`/codex`, or the legacy `@codex`), and the noise a legacy trigger leaves (deprecation notices, connector replies). GraphQL names bots without `[bot]`:

   ```bash
   gh api graphql --paginate -f owner=wesprint-io -f name=monorepo -F n=$n \
     -f query='query($owner:String!,$name:String!,$n:Int!,$endCursor:String){repository(owner:$owner,name:$name){pullRequest(number:$n){comments(first:100,after:$endCursor){pageInfo{hasNextPage endCursor} nodes{id isMinimized author{login} body}}}}}' \
     --jq ".data.repository.pullRequest.comments.nodes[] | select((.isMinimized | not) and ((.author.login == \"github-actions\" and ((.body | startswith(\"<!-- codex-review -->\")) or (.body | contains(\"is deprecated. Comment\")))) or .author.login == \"chatgpt-codex-connector\" or (.author.login == \"$me\" and ((.body | startswith(\"/codex\")) or (.body | contains(\"@codex\")))))) | .id"
   ```

3. Before folding anything, read the unfolded reviews, the replies to them and the previous trigger comment (`read pr://<n>/comments`), and draft the new trigger comment body:
   - First line: `/codex review this PR`. The body must start with `/codex`, and must not contain `@codex` anywhere.
   - A few lines of context: what the PR does, where it sits in its stack, and what is out of scope (handled in another PR or ticket).
   - Every settled finding from earlier reviews, one bullet each, so Codex does not raise it again: fixed (name the commit by subject, since restacks change shas), or accepted by the user (won't fix / documented / irrelevant), with the one-line reason.
   - Anything the user added when invoking the skill.
   - No line may be exactly `PROMPT_EOF`: the body is spliced into that heredoc.
4. Fold each comment found in step 2 as outdated; never delete one:
   `gh api graphql -f id=<id> -f query='mutation($id:ID!){minimizeComment(input:{subjectId:$id,classifier:OUTDATED}){minimizedComment{isMinimized}}}'`
5. Post the trigger: `write` the body to `pr://<n>/comment`. The receipt names the new comment's URL.
6. Verify by re-running step 2: only the new trigger comment is left unfolded. Record its `created_at` as `since`. Then check the trigger took: within a minute, `gh run list -R $r -w codex.yaml -L 5` shows an `in_progress` run titled with the PR's title, and no deprecation notice was posted. If not, re-read the workflow's trigger rules on `main` before retrying.

## 2. Wait for the review

7. Start this in the background (bash `timeout` 2700: the job's limit is 40 minutes), then end the turn. Each `bash` call is a fresh shell, so set `r`, `n` and `since` in the same call:

   ```bash
   until gh api --paginate repos/$r/issues/$n/comments \
     --jq ".[] | select(.user.login == \"github-actions[bot]\" and .created_at > \"$since\" and (.body | startswith(\"<!-- codex-review -->\"))) | .id" | grep -q .; do
     sleep 30
   done
   ```

8. Read the new comment: the last entry of `read pr://<n>/comments`. If the marker line is not followed by a `### Summary` review (for example "The code review could not be generated."), report it and stop.

## 3. Work through the findings

9. If the review has no findings, stop: report the number of rounds, the commits pushed and the findings the user accepted.
10. Otherwise, for each finding, check it against the code. Do not trust it blindly.
    - Real and in scope: fix it.
    - Wrong, out of scope, or not worth fixing: ask the user (see Rules). Fix it if they say so.
    - Already settled but raised again: ask the user whether to reword its bullet or fix it.
11. Commit each fix as its own commit, run the checks that cover it, and push the branch.
12. Add every finding of this round to the settled list, then go back to step 1 with the updated context.
