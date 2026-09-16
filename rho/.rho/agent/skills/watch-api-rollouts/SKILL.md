---
name: watch-api-rollouts
description: Read-only monitoring for one or more production API Kubernetes workloads. Resolve service namespaces and images, wait for exact Deployment or StatefulSet rollouts, detect CrashLoopBackOff and startup failures, hold a clear stability window, and collect diagnostics without mutating the cluster. Use when asked to watch, verify, or report deployment health for a set of APIs.
compatibility: Requires kubectl access to the target cluster and Python 3. Supports Kubernetes Deployments and StatefulSets.
---

# Watch API rollouts

Monitor only. Never restart, scale, delete, patch, roll back, switch Kubernetes contexts, or otherwise mutate the cluster unless the user makes a separate explicit request.

## Resolve targets

For each requested API, determine:

- namespace;
- workload kind (`deployment` or `statefulset`);
- workload name;
- target container name;
- exact expected image, including tag.

For services managed by `/Users/lucas/work/infrastructure`, derive these from the application constructor, `WithImage`, workload modifiers such as `AsStatefulSet`, and `production/applications/versions/versions.go`. Use the source rather than guessing from naming. Ask the user if any mapping is ambiguous.

Verify `kubectl config current-context`. If the user specified a cluster or the repository implies one, pass it as `--expected-context`; the script fails instead of switching contexts. Query known namespaces directly because the current identity may not have permission to list workloads cluster-wide.

## Run the monitor

The bundled read-only monitor accepts one or more repeatable targets:

```bash
./scripts/watch-api-rollouts.py \
  --expected-context gke_applications-5h1pm3n7_us-central1-b_us1b-applications \
  --target 'frontend/deployment/main-api:main-api=us-central1-docker.pkg.dev/registry-5h1pm3n7/backend/main:e5cf528' \
  --target 'backend/deployment/profile-view-api:profile-view-api=us-central1-docker.pkg.dev/registry-5h1pm3n7/backend/profile_view:c100ca7' \
  --stability-seconds 300
```

Target syntax is:

```text
namespace/kind/workload-name:container-name=exact-image
```

The monitor:

1. captures initial generations, images, pod UIDs, and restart counts;
2. waits for every exact pod-template image;
3. waits for each Kubernetes rollout;
4. verifies generation and desired/updated/ready/available replica state;
5. verifies every active target container uses the exact image and is Ready;
6. watches fatal startup states and restart-count changes through the stability window;
7. prints diagnostics automatically on failure.

Use `--require-change` when invoked before a deployment and a real redeploy must be proven. Use `--fail-on-rollout-restarts` for a strict clean-rollout gate: newly created pods that restarted before becoming Ready fail even if they later recover.

## Choose the observation mode

- **Deployment verification:** default to a 300-second stability window and say explicitly that rollout completion is followed by a timed stability phase. The script prints the phase, remaining seconds, and expected finish time so it does not look stuck.
- **Quick health snapshot:** pass `--stability-seconds 0`. This verifies current image, rollout, replicas, pod readiness, and fatal waiting states without an extended watch.
- **User-specified watch:** use their requested duration. Do not silently shorten it.

A restart count that remains stable is not equivalent to a clean rollout, but it is not automatically a failed deployment. Report rollout-period restarts and their previous termination reason even when the later stability window passes. In particular, main-api can transiently exit with `Address already in use` during redeploy; treat it as a non-critical caveat when the pod becomes Ready and restart counts remain stable. Fail if it persists, readiness does not recover, a fatal waiting state appears, or restart counts continue increasing. If the user explicitly requests strict mode, treat any new rollout-pod restart as failure.

## Report

Report for each API:

- namespace and workload kind/name;
- exact image;
- desired/updated/ready/available replicas;
- whether a redeployment was observed;
- stability-window duration;
- restart deltas and any rollout-period restarts;
- CrashLoopBackOff or other waiting/termination evidence;
- monitoring limitations.

If interrupted, state how much of the requested window completed. Never claim the full stability window passed.
