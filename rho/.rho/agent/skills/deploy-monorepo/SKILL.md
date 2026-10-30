---
name: deploy-monorepo
description: Deploy a wesprint-io/monorepo backend change end to end, or just watch production API rollouts. The full path waits for green PR CI, merges the current PR only after the user approves, waits for the backend release, opens an infrastructure version-bump PR for the user to merge, then watches the Pulumi run and the Kubernetes rollout through a crash-free stability window. The watch-only path checks whether one or more API Deployments or StatefulSets rolled out and stay healthy. Use when asked to merge and deploy the monorepo PR, or to watch, verify or report the health of a rollout.
compatibility: Requires gh, git, jq, Python 3, kubectl access to the production cluster, access to wesprint-io/monorepo and wesprint-io/infrastructure, and checkouts at /Users/lucas/work/monorepo and /Users/lucas/work/infrastructure.
---

# Deploy a monorepo PR

Two entry points:

- **Full deploy**: follow sections 1 to 8 in order.
- **Watch only** ("is this rollout healthy?"): go straight to section 8. Skip 8.3 unless an infrastructure run is part of the question.

## Rules

- **Never merge without the user's go-ahead.** Green CI is not consent. Ask before merging the monorepo PR, naming the PR and its head SHA. Ask again if the head changes.
- **Never merge the infrastructure PR.** The user merges it. Do not enable auto-merge or deploy around it.
- **Never mutate the cluster.** No restart, scale, delete, patch, rollback or context switch unless the user asks for it separately.
- Run commands non-interactively, with explicit repository and PR numbers. Never rely on a current-branch default.
- Do not use stacked-PR tooling, merge a stack, or update other PRs.
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

## 3. Ask, then squash-merge only that PR

### Check the stack

The monorepo uses GitHub native PR stacks. For a stacked PR, `gh pr merge` and the synchronous merge endpoint are rejected. The async endpoint merges every PR in the stack up to and including the target. So first prove it merges nothing else:

1. Query `GET /repos/wesprint-io/monorepo/stacks` with API version `2026-03-10`. Find the one stack holding the PR.
2. Require every `pull_requests` entry before the target to be merged already. Entries after it are not merged.
3. If a predecessor is still open, stop and ask the user.
4. If the PR is not in a stack, plan an ordinary explicit squash merge.

### Ask

Ask the user with the questionnaire tool before merging. Give the PR URL, head SHA, CI result, merge method, and for a stack the PRs before and after it. Merge only on an explicit yes.

### Merge

For a stacked PR:

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

Then confirm the target is `MERGED` and every later stack PR is still open. Record `mergeCommit.oid` and `mergedAt`. Never infer the merge SHA from the old branch head.

## 4. Wait for the backend release

```bash
/Users/lucas/.rho/agent/skills/deploy-monorepo/scripts/watch-backend-release.sh \
  "$monorepo_merge_sha" "$backend_image_name"
```

It prints JSON: `runId`, `url`, `mergeSha`, `runHeadSha`, `exact`, `image`, `metadataHash`.

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

The workflow has a push `paths` filter. A merge that touches no backend path gets no run, and the script fails after 15 minutes. Check the PR's paths against the filter, then tell the user.

## 5. Choose the services to bump

Map each built image to its production service:

- image: `WithImage` in `/Users/lucas/work/infrastructure/production/applications/**.go`;
- deployed version: `Overrides` in `/Users/lucas/work/infrastructure/production/applications/versions/versions.go`.

Use the monorepo diff, Bazel image ownership, Metadata image names and `WithImage` together. Bump only services that need the change. Never change the global `ReleaseHash` to deploy a few services.

If several services are plausible, the mapping is unclear, or the change may need coordinated bumps, propose a list with evidence and ask. If the mapping is clear, go ahead.

## 6. Open the infrastructure PR

Work from `/Users/lucas/work/infrastructure`.

1. Require a clean working tree. If dirty, stop.
2. Fetch, switch to `main`, `git pull --ff-only origin main`.
3. Create a fresh branch under `ae2rs/`. Make sure it exists neither locally nor on the remote.
4. In `versions.go`, replace only the chosen services' hashes with the Metadata hash.
5. Run `gofmt` on the file and read the diff.
6. Run the smoke test. The PR's CI runs `go test ./...` and builds the Pulumi program, so do not repeat them here:

   ```bash
   go test ./pkg/spec/ -run TestLoadSmoke -count=1
   ```
7. Commit one change in the repository's imperative subject style.
8. Push with upstream tracking and open a PR against `main`. Put in the body: monorepo PR URL, merge SHA, release run URL, image hash, services bumped.

Never include unrelated files or existing changes.

## 7. Wait for infrastructure CI, then hand off

```bash
/Users/lucas/.rho/agent/skills/deploy-monorepo/scripts/wait-pr-ci.sh \
  wesprint-io/infrastructure "$infra_pr" "$infra_head_sha"
```

For `wesprint-io/infrastructure`, the script also requires the `gke-applications/gke-applications - Update (preview)` Pulumi check. Pulumi Cloud can post it after every GitHub job has finished, so the script waits until it is present and finished, and fails if it never appears.

Then stop and hand the PR to the user with:

- monorepo PR URL and merge SHA;
- release run URL, and `runHeadSha` if `exact` was false;
- image hash;
- services bumped;
- infrastructure PR URL and CI result;
- validation caveats;
- a request to merge the infrastructure PR and say when it is done.

## 8. Watch the rollout

In a full deploy, resume only once the user says the infrastructure PR is merged. Re-query it, require `state: MERGED`, and record `mergeCommit.oid` as the infrastructure merge SHA.

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

In a full deploy, also give the infrastructure PR, its merge SHA and the Pulumi run URL.

If monitoring was interrupted, say how much of the window completed. Never claim the full window passed.
