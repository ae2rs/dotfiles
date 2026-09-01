---
name: merge-deploy-monorepo-pr
description: Merge the current wesprint-io/monorepo pull request after all CI is green, wait for its backend images on main, open an infrastructure image-version bump PR, wait for that PR's CI, and stop for manual merge. Use when asked to merge and deploy the monorepo PR checked out in the current branch end to end.
compatibility: Requires gh, git, access to wesprint-io/monorepo and wesprint-io/infrastructure, and local checkouts at /Users/lucas/work/monorepo and /Users/lucas/work/infrastructure.
---

# Merge and deploy a monorepo PR

This workflow is intentionally asymmetric:

- You **may merge exactly the current monorepo PR** after its CI is fully green.
- You **must never merge the infrastructure PR**. Return it to the user after its CI is fully green.

Run commands non-interactively with explicit repository and PR identifiers. Do not use stacked-PR tooling, merge a stack, update other PRs, enable auto-merge, or merge via an ambiguous current-branch default.

## 1. Identify and pin the monorepo PR

Work from `/Users/lucas/work/monorepo`.

1. Inspect `git status --short --branch`. Do not modify or discard local changes.
2. Resolve the PR for the checked-out branch with `gh pr view` and record its number, URL, repository, base branch, head branch, and `headRefOid`.
3. Require all of the following:
   - repository is `wesprint-io/monorepo`;
   - PR is open and not a draft;
   - base branch is `main`;
   - the PR head branch equals the checked-out branch.
4. Inspect the PR's changed files and understand which deployable backend image or images contain the changes. Do not guess from the PR title alone.

If no unique current PR can be established, stop and ask the user.

## 2. Wait for fully green PR CI

Wait for checks on the pinned PR number, for example:

```bash
gh pr checks "$pr" --repo wesprint-io/monorepo --watch --interval 15
```

If checks have not appeared yet, poll until at least one exists before watching. After the watch exits, query `statusCheckRollup` again and verify:

- every check is terminal;
- no check has a failing, cancelled, timed-out, action-required, or stale conclusion;
- expected skipped checks are acceptable;
- the PR remains mergeable and is not behind or blocked.

Re-read `headRefOid` and require it to equal the pinned SHA. If the head changed, restart the CI verification for the new SHA. Never merge after a failed check; report the failure and stop unless the user separately asks for a fix.

## 3. Squash-merge only that PR

The monorepo uses GitHub native PR stacks. `gh pr merge` and the synchronous REST merge endpoint are rejected for a stacked PR. The required asynchronous endpoint merges every PR in the stack **up to and including the target**, so prove first that it cannot merge another open PR:

1. Query `GET /repos/wesprint-io/monorepo/stacks` with GitHub API version `2026-03-10` and find the single stack containing the pinned PR.
2. Inspect the stack's ordered `pull_requests` array. Require every entry before the target to already be merged. Entries after the target are not merged by this operation.
3. If any predecessor is still open, stop and ask the user; invoking the endpoint would violate the “only this PR” rule.
4. If the PR is not in a stack, use the ordinary explicit squash merge.

For a safe stacked target, enqueue exactly the pinned PR:

```bash
response=$(gh api --method PUT \
  -H 'Accept: application/vnd.github+json' \
  -H 'X-GitHub-Api-Version: 2026-03-10' \
  "repos/wesprint-io/monorepo/pulls/$pr/merge-async" \
  -f merge_method=squash \
  -f merge_action=direct_merge \
  -f sha="$pinned_head_sha")
```

Take the UUID from `.details.uuid`, poll `GET /repos/wesprint-io/monorepo/pulls/$pr/merge-async/$uuid`, and require `status: merged`. Treat any failed, rejected, or cancelled result as fatal. Confirm that the target is `MERGED` and every later stack PR remains open, then record the target's `mergeCommit.oid` and `mergedAt`. Do not infer the merge SHA from the former branch head.

## 4. Wait for the exact main backend release

Find the `Backend: release main` workflow run satisfying all of these:

- repository `wesprint-io/monorepo`;
- workflow file `backend_release_main.yaml`;
- event `push`;
- branch `main`;
- `headSha` exactly equals the PR's merge commit SHA.

Poll because the run may not exist immediately. Do not select merely the latest run: another PR can merge first. Wait for the run with `gh run watch <run-id> --exit-status` and require the job/check `Backend: release main / backend_release (push)` to succeed.

Find the `backend_release` job ID, download its log, and inspect the `Metadata` step. Parse image lines shaped like:

```text
us-central1-docker.pkg.dev/registry-5h1pm3n7/backend/<image>:<hash>
```

Take the hash from the Metadata output and require all visible Metadata image lines to agree. GitHub currently truncates the single multi-line `containers images` notice at about 64 KB, so an image late in the list (including `main`) may be absent from both the downloaded Metadata log and the check-run annotation. If the selected image is truncated, require it to appear in the successful `Build` step with the exact Metadata-derived hash. Do not derive the hash solely from the merge SHA.

## 5. Select infrastructure services safely

Map each built image to its production service name using the infrastructure declarations:

- image repository: `/Users/lucas/work/infrastructure/production/applications/**.go` (`WithImage`);
- deployed version: `/Users/lucas/work/infrastructure/production/applications/versions/versions.go` (`Overrides`).

Use the monorepo diff, Bazel image ownership, Metadata image names, and infrastructure `WithImage` declarations together. Bump only services that need the merged behavior. Do not change global `ReleaseHash` to deploy one or a few services.

If more than one service is plausible, the affected image-to-service mapping is unclear, or the change could require coordinated service bumps, ask the user to confirm the exact service list before editing. State your proposed list and evidence. If the mapping is unambiguous, proceed without asking.

## 6. Create the infrastructure PR

Work from `/Users/lucas/work/infrastructure`.

1. Require a clean working tree. If it is dirty, stop rather than mixing changes.
2. Fetch, switch to `main`, and run `git pull --ff-only origin main`.
3. Create a fresh descriptive branch under `ae2rs/`; ensure neither the local nor remote branch already exists.
4. In `production/applications/versions/versions.go`, replace only the selected service entries' hashes with the Metadata hash.
5. Run `gofmt` on the edited Go file and inspect the diff.
6. Mirror the infrastructure PR's Go validation:

   ```bash
   go test ./pkg/spec/ -run TestLoadSmoke -count=1
   go test ./... -count=1
   go build -ldflags='-s -w' -o /tmp/infrastructure-pulumi-program ./cmd/runs/gke/production
   ```

   Always pass `-o` to the build: the default output name `production` collides with the repository's `production/` directory. If a check fails for an unrelated environmental reason, report it explicitly; do not hide it.
7. Commit one logical change using the repository's existing imperative subject style.
8. Push with upstream tracking and create a PR against `main`. Include the monorepo PR URL, merge SHA, backend release run URL, image hash, and exact services bumped in the PR body.

Never include unrelated files or pre-existing changes.

## 7. Wait for infrastructure CI, then stop

Wait until checks appear on the new infrastructure PR, then watch them to completion. Re-query all checks and require fully green terminal CI using the same criteria as the monorepo PR. The external `gke-applications/gke-applications - Update (preview)` Pulumi check can attach after the Actions jobs finish, so keep polling until the terminal check count is stable across multiple polls and that preview is present and successful.

**Do not merge the infrastructure PR, do not enable auto-merge, and do not deploy around it.** Return control to the user with:

- merged monorepo PR URL and merge SHA;
- successful backend release run URL;
- Metadata image hash;
- bumped infrastructure services;
- infrastructure PR URL and CI result;
- any validation caveats.
