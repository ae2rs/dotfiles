---
name: deploy-monorepo
description: Deploy a wesprint-io/monorepo backend change end to end, or just watch production API rollouts. The full path waits for green PR CI, merges the current PR only after the user approves, posts the bump message in #backend-release, waits for the backend release, opens the infrastructure version-bump PR and merges it once its CI is green, then watches the Pulumi run and the Kubernetes rollout through a crash-free stability window and marks the bump message done with a check reaction. The watch-only path checks whether one or more API Deployments or StatefulSets rolled out and stay healthy. Use when asked to merge and deploy the monorepo PR, or to watch, verify or report the health of a rollout.
compatibility: Requires gh, git, jq, Python 3, kubectl access to the production cluster, access to wesprint-io/monorepo and wesprint-io/infrastructure, the Slack MCP server, and checkouts at /Users/lucas/work/monorepo and /Users/lucas/work/infrastructure.
---

# Deploy a monorepo PR

Two entry points:

- **Full deploy**: follow sections 1 to 8 in order.
- **Watch only** ("is this rollout healthy?"): go straight to section 8. Skip 8.3 unless an infrastructure run is part of the question.

## Rules

- **Never merge the monorepo PR without the user's go-ahead.** Green CI is not consent. Ask before merging it, naming the PR and its head SHA. Ask again if the head changes.
- **Merge the infrastructure PR yourself, only as section 7 says**: squash, green CI at the pinned head, `--match-head-commit`. Never enable auto-merge, bypass a check, or merge any other infrastructure PR.
- **Post in Slack only in #backend-release** (`C0ALZF3FVA8`): one bump message per deploy (section 5), and a `white_check_mark` reaction on it once the deployment succeeds (section 8.6). Never edit, delete or react to any other message.
- **Never mutate the cluster.** No restart, scale, delete, patch, rollback or context switch unless the user asks for it separately.
- Run commands non-interactively, with explicit repository and PR numbers. Never rely on a current-branch default.
- Do not use stacked-PR tooling, merge stack PRs beyond the ones the user chose, or update other PRs.
- **Never block on a long wait.** Start each wait or watch script with `bash` in the background, give the user one status line, and end the turn. Its exit notice resumes the deploy, and the user can talk to you meanwhile. Do not call `run` `wait` on it, and do not prefix it with `sleep`.

## Scripts

All in `/Users/lucas/.rho/agent/skills/deploy-monorepo/scripts/`. They are read-only.

- `wait-pr-ci.sh`: waits for a pinned PR SHA to go green, late external checks included, and re-checks mergeability.
- `watch-backend-release.sh`: finds the release run that contains a merge commit and prints its image hash.
- `watch-infrastructure-deploy.sh`: watches the infrastructure `Pulumi` run for a merge SHA and checks `Pulumi up`.
- `watch-api-rollouts.py`: watches Kubernetes rollouts and a stability window.

Merges and infrastructure edits stay unscripted on purpose, so their safety decisions stay explicit.

## 1. Pin the monorepo PR

Work from `/Users/lucas/work/monorepo`.

1. Check `git status --short --branch`. Do not modify or discard local changes.
2. Resolve the PR for the branch with `gh pr view`. Record its number, URL, base, head branch and `headRefOid`.
3. Require:
   - repository `wesprint-io/monorepo`;
   - PR open and not a draft;
   - base `main`;
   - PR head branch equals the checked-out branch.
4. Read the changed files and work out which backend images contain the change. Do not guess from the title.

If no single PR can be pinned, stop and ask.

## 2. Wait for green PR CI

```bash
/Users/lucas/.rho/agent/skills/deploy-monorepo/scripts/wait-pr-ci.sh \
  wesprint-io/monorepo "$pr" "$pinned_head_sha"
```

The script exits non-zero unless all of these hold:

- every check is terminal;
- none failed, was cancelled, timed out, needs action or is stale (skipped and neutral are fine);
- the PR is mergeable and clean;
- `headRefOid` still equals the pinned SHA.

If the head moved, pin the new SHA and wait again. If a check failed, report it and stop.

## 3. Ask, then squash-merge the chosen PRs

### Check the stack

The monorepo uses GitHub native PR stacks. For a stacked PR, `gh pr merge` and the synchronous merge endpoint are rejected. The async endpoint merges every PR in the stack up to and including the target. So first map the stack:

1. Query `GET /repos/wesprint-io/monorepo/stacks` with API version `2026-03-10`. Find the one stack holding the PR.
2. Require every `pull_requests` entry before the PR to be merged already. If a predecessor is still open, stop and ask the user.
3. Note every open entry after the PR. These are the candidates for a stack merge.
4. If the PR is not in a stack, plan an ordinary explicit squash merge.

### Ask

Ask the user with the questionnaire tool before merging. Give the PR URL, head SHA, CI result and merge method.

For a stacked PR with open PRs after it, also ask the scope, even when the user already approved the merge:

- only this PR;
- the stack up to and including each later open PR, listed by number and title, the top one being the whole stack.

Merge only on an explicit yes. The target is the top PR of the chosen scope.

For a scope wider than one PR, before merging:

- pin each PR's `headRefOid` and run section 2 for each of them. Stop on any failure, as for one PR;
- choose services (section 5) from the changed files of every PR in the scope.

### Merge

For a stacked PR, with `$pr` and `$pinned_head_sha` the target's:

```bash
response=$(gh api --method PUT \
  -H 'Accept: application/vnd.github+json' \
  -H 'X-GitHub-Api-Version: 2026-03-10' \
  "repos/wesprint-io/monorepo/pulls/$pr/merge-async" \
  -f merge_method=squash \
  -f merge_action=direct_merge \
  -f sha="$pinned_head_sha")
```

Take the UUID from `.details.uuid`. Poll `GET /repos/wesprint-io/monorepo/pulls/$pr/merge-async/$uuid` until `status: merged`. Any failed, rejected or cancelled status is fatal.

Then confirm every PR in the scope is `MERGED` and every PR after the target is still open. Record each one's `mergeCommit.oid` and `mergedAt`. Never infer a merge SHA from an old branch head. The rest of the deploy uses the target's merge SHA: it is the tip of the push, and it contains the others.

Go straight on to section 4: the bump message goes out right after the merge.

## 4. Wait for the backend release

```bash
/Users/lucas/.rho/agent/skills/deploy-monorepo/scripts/watch-backend-release.sh \
  "$monorepo_merge_sha" "$backend_image_name"
```

Start it in the background, then choose the services and post the bump message (section 5) while it runs. It prints JSON: `runId`, `url`, `mergeSha`, `runHeadSha`, `exact`, `image`, `metadataHash`.

### How it picks the run

- Workflow `.github/workflows/backend_release.yaml`, named `Backend: release`, job `backend_release`. It also runs on PRs; the script keeps only `push` runs on `main`.
- It takes the oldest uncancelled run whose head is the merge commit or a descendant of it. Never just the latest run: another PR can merge first.
- A stack merge pushes several commits at once, and only the tip gets a run. A newer pending run also cancels an older pending one.

### When `exact` is false

The run was built from a later commit than the merge. Check that `runHeadSha` is the tip of the same stack push, or the next push after it. If unsure, show the user both SHAs and ask. The hash to deploy is still `metadataHash`.

### How it reads the hash

- The hash comes from the `Metadata` step lines `backend/<image>:<hash>`. All of them must agree.
- GitHub truncates the Metadata notice at about 64 KB, so late images such as `main` can be missing. The script then requires `backend/<image>:<hash>` in the `Push` step.
- The hash can name a commit later than `runHeadSha`: run 39992607650 at `1ca1139f` published `845f065`. Deploy `metadataHash`, never a hash derived from a SHA.

### If no run appears

The workflow has a push `paths` filter. A merge that touches no backend path gets no run, and the script fails after 15 minutes. Check the PR's paths against the filter, then tell the user, and say the bump message is already posted.

## 5. Choose the services to bump

Map each built image to its production service:

- image: `WithImage` in `/Users/lucas/work/infrastructure/production/applications/**.go`;
- deployed version: `Overrides` in `/Users/lucas/work/infrastructure/production/applications/versions/versions.go`.

Use the monorepo diff, Bazel image ownership and `WithImage` together. Bump only services that need the change. Never change the global `ReleaseHash` to deploy a few services.

If several services are plausible, the mapping is unclear, or the change may need coordinated bumps, propose a list with evidence and ask. If the mapping is clear, go ahead.

### Post the bump message

As soon as the services are chosen, post the bump message in #backend-release, so the team knows the bump is under way.

List the chosen services, plus every service that points at the same shared hash variable (such as `BumpyHash`) in `versions.go`, in the file's order. The message is one line, each service wrapped in backticks, nothing else:

```text
:bump: `name-api` `name-2-api`
```

Send it with `slack/slack_send_message`, `channel_id` `C0ALZF3FVA8`. Record the message `ts` for section 8.6; if the tool returns none, find the message with `slack/slack_read_channel`. Post once per deploy: if the services change later, tell the user rather than posting again.

## 6. Open the infrastructure PR

Work from `/Users/lucas/work/infrastructure`.

1. Require a clean working tree. If dirty, stop.
2. Fetch, switch to `main`, `git pull --ff-only origin main`.
3. Create a fresh branch under `ae2rs/`. Make sure it exists neither locally nor on the remote.
4. Require the release's images to cover every chosen service, or stop and ask. In `versions.go`, replace only the chosen services' hashes with the Metadata hash.
5. Run `gofmt` on the file and read the diff.
6. Run the smoke test. The PR's CI runs `go test ./...` and builds the Pulumi program, so do not repeat them here:

   ```bash
   go test ./pkg/spec/ -run TestLoadSmoke -count=1
   ```
7. Commit one change in the repository's imperative subject style.
8. Push with upstream tracking and open a PR against `main`. Put in the body: monorepo PR URL, merge SHA, release run URL, image hash, services bumped.

Never include unrelated files or existing changes.

## 7. Wait for infrastructure CI, then merge

```bash
/Users/lucas/.rho/agent/skills/deploy-monorepo/scripts/wait-pr-ci.sh \
  wesprint-io/infrastructure "$infra_pr" "$infra_head_sha"
```

For `wesprint-io/infrastructure`, the script also requires the `gke-applications/gke-applications - Update (preview)` Pulumi check. Pulumi Cloud can post it after every GitHub job has finished, so the script waits until it is present and finished, and fails if it never appears.

If a check fails, report it and stop. If the head moved, pin the new SHA and wait again.

Once the PR is ready (not a draft) and its CI is green at the pinned head:

1. Resolve the targets and start the rollout monitor (sections 8.1 and 8.2), so it captures the starting state before the merge.
2. Squash-merge only this PR at the pinned head:

   ```bash
   gh pr merge "$infra_pr" --repo wesprint-io/infrastructure --squash --match-head-commit "$infra_head_sha"
   ```
3. Re-query it, require `state: MERGED`, and record `mergeCommit.oid` as the infrastructure merge SHA. If the merge fails, cancel the monitor and report.
4. Watch the infrastructure run (section 8.3).

## 8. Watch the rollout

In a full deploy, section 7 has started the monitor and merged the infrastructure PR: continue at 8.3.

### 8.1 Resolve the targets

For each service, find:

- namespace;
- workload kind (`deployment` or `statefulset`);
- workload name;
- container name;
- exact image with tag.

For services in `/Users/lucas/work/infrastructure`, read the application constructor, `WithImage`, modifiers such as `AsStatefulSet`, and `versions.go`. Do not guess from names. Ask if a mapping is unclear.

Query known namespaces directly: this account may not list workloads cluster-wide.

### 8.2 Start the monitor

In a full deploy, start it before the Pulumi run reaches Kubernetes, so it captures the starting generations, images, pod UIDs and restart counts. Start it as its own `bash` call, without `&`: rho keeps it running in the background as a run. Note its `run://<id>`. Repeat `--target` per service:

```bash
PYTHONUNBUFFERED=1 /Users/lucas/.rho/agent/skills/deploy-monorepo/scripts/watch-api-rollouts.py \
  --context gke_applications-5h1pm3n7_us-central1-b_us1b-applications \
  --target 'frontend/deployment/main-api:main-api=us-central1-docker.pkg.dev/registry-5h1pm3n7/backend/main:<hash>' \
  --require-change \
  --stability-seconds 300
```

Target syntax: `namespace/kind/workload-name:container-name=exact-image`.

`--context` is passed to every kubectl call. The user's current context is never read or changed.

The monitor:

1. records the starting state;
2. waits for every pod template to use the exact image;
3. waits for each rollout: generation, desired, updated, ready and available replicas;
4. checks every active pod runs the exact image and is Ready;
5. holds a stability window, failing on fatal waiting states or rising restart counts;
6. prints diagnostics and logs on failure.

A pod that has just been scheduled and has no container status yet counts as starting. Succeeded and Failed pods (for example evicted ones) are ignored.

Flags:

- `--require-change`: prove a real redeploy. Use it only when started before the rollout. If the image is already live, drop it, check the new ReplicaSet or revision in Kubernetes history, and say the starting state was not captured.
- `--stability-seconds`: 300 for a deploy. 0 for a quick health snapshot. Use the user's number if they give one; never shorten it silently.
- `--fail-on-rollout-restarts`: only when the user asks for a strict clean-rollout gate.

The stability phase prints its remaining time and finish time, so it does not look stuck. Say so when you start it.

### 8.3 Watch the infrastructure run

In parallel with the monitor, as a second `bash` call:

```bash
/Users/lucas/.rho/agent/skills/deploy-monorepo/scripts/watch-infrastructure-deploy.sh \
  "$infrastructure_merge_sha"
```

It pins the `Pulumi` push run whose head is the merge SHA, using the Actions API because `gh run list` can miss fresh runs. It requires `Reject stale runs`, `Deployment` and `Pulumi up` to succeed.

If `Reject stale runs` rejects it, find the newer successful main run carrying the same version, check the hash is still on main, and watch that one instead. Never rerun or bypass a failed deployment without the user's approval.

Give the user one status line and end the turn. Each run's exit notice brings you back; read its output from `run://<id>`. The deployment is done when both have exited. A non-zero exit from either is a failed or interrupted deployment.

If the infrastructure run fails, stop the monitor with `run` `cancel` and report.

To show why a GitHub run failed, read `actions://<owner>/<repo>/<run>/logs`: each failed job's log up to its first error. `actions://<owner>/<repo>/<run>` lists its jobs and where each failed. Reruns still need the user's approval.

### 8.4 Judge restarts

A rollout-period restart that recovers is a caveat to report, not a failure. Known transients:

- **main-api** can exit with `Address already in use` during a redeploy.
- **token-api** pings `api.back.commerce.Service` at startup and exits if it can't reach it. When it rolls out with commerce-api (one pod), it restarts once or twice, then recovers.

Fail when readiness does not recover, a fatal waiting state persists, or restart counts keep rising in the stability window. In strict mode, any new rollout-pod restart fails.

### 8.5 Report

Call a deployment successful only after both the infrastructure run and the full stability window pass. Report, per service:

- namespace, workload kind and name, image;
- desired, updated, ready and available replicas;
- whether a redeploy was observed (pod UIDs or revision changed);
- requested and completed stability window;
- restart deltas, rollout-period restarts and their last termination reason;
- CrashLoopBackOff or other waiting or termination evidence;
- monitoring limits.

In a full deploy, also give the monorepo PR and merge SHA, the release run URL (and `runHeadSha` if `exact` was false), the image hash, the infrastructure PR, its merge SHA and the Pulumi run URL.

If monitoring was interrupted, say how much of the window completed. Never claim the full window passed.

### 8.6 Mark the bump message done

Once 8.5 calls the deployment successful, react to the bump message this session posted: `slack/slack_add_reaction` with `channel_id` `C0ALZF3FVA8`, `emoji` `white_check_mark` and its `message_ts`. The check tells the channel the bump is live.

If the deployment failed or monitoring was interrupted, add no reaction and say so in the report. In a watch-only run, skip this unless this session posted the bump message.
