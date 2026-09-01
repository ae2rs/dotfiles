#!/usr/bin/env python3
"""Read-only Kubernetes rollout and crash-loop monitor for one or more APIs."""

from __future__ import annotations

import argparse
import dataclasses
import datetime as dt
import json
import subprocess
import sys
import time
from typing import Any


FATAL_WAITING_REASONS = {
    "CrashLoopBackOff",
    "ImagePullBackOff",
    "ErrImagePull",
    "CreateContainerConfigError",
    "RunContainerError",
    "InvalidImageName",
}


@dataclasses.dataclass(frozen=True)
class Target:
    namespace: str
    kind: str
    name: str
    container: str
    image: str

    @property
    def ref(self) -> str:
        return f"{self.kind}/{self.name}"

    @property
    def display(self) -> str:
        return f"{self.namespace}/{self.ref}:{self.container}={self.image}"


@dataclasses.dataclass
class InitialState:
    generation: int
    image: str
    pod_uids: set[str]
    restarts: dict[str, int]


class MonitorError(RuntimeError):
    pass


def run(*args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(args, text=True, capture_output=True)
    if check and result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip()
        raise MonitorError(f"command failed ({' '.join(args)}): {detail}")
    return result


def kubectl_json(*args: str) -> dict[str, Any]:
    result = run("kubectl", *args, "-o", "json")
    return json.loads(result.stdout)


def parse_target(value: str) -> Target:
    # namespace/kind/name:container=image
    try:
        workload, image = value.split("=", 1)
        resource, container = workload.rsplit(":", 1)
        namespace, kind, name = resource.split("/", 2)
    except ValueError as error:
        raise argparse.ArgumentTypeError(
            "target must be namespace/kind/name:container=image"
        ) from error
    kind = kind.lower()
    if kind not in {"deployment", "statefulset"}:
        raise argparse.ArgumentTypeError("kind must be deployment or statefulset")
    if not all((namespace, name, container, image)):
        raise argparse.ArgumentTypeError("target fields must be non-empty")
    return Target(namespace, kind, name, container, image)


def workload(target: Target) -> dict[str, Any]:
    return kubectl_json("get", target.kind, target.name, "-n", target.namespace)


def selector_for(item: dict[str, Any]) -> str:
    selector = item.get("spec", {}).get("selector", {})
    labels = selector.get("matchLabels", {})
    expressions = selector.get("matchExpressions", [])
    parts = [f"{key}={value}" for key, value in sorted(labels.items())]
    for expression in expressions:
        key = expression["key"]
        operator = expression["operator"]
        values = expression.get("values", [])
        if operator == "In":
            parts.append(f"{key} in ({','.join(values)})")
        elif operator == "NotIn":
            parts.append(f"{key} notin ({','.join(values)})")
        elif operator == "Exists":
            parts.append(key)
        elif operator == "DoesNotExist":
            parts.append(f"!{key}")
        else:
            raise MonitorError(f"unsupported selector operator {operator!r}")
    if not parts:
        raise MonitorError("workload has no pod selector")
    return ",".join(parts)


def template_image(item: dict[str, Any], container: str) -> str:
    containers = item.get("spec", {}).get("template", {}).get("spec", {}).get("containers", [])
    matches = [entry.get("image", "") for entry in containers if entry.get("name") == container]
    if len(matches) != 1:
        raise MonitorError(f"expected exactly one template container named {container!r}")
    return matches[0]


def active_pod_statuses(target: Target, item: dict[str, Any]) -> list[dict[str, Any]]:
    pods = kubectl_json(
        "get", "pods", "-n", target.namespace, "-l", selector_for(item)
    ).get("items", [])
    statuses: list[dict[str, Any]] = []
    for pod in pods:
        if pod.get("metadata", {}).get("deletionTimestamp") is not None:
            continue
        matches = [
            status
            for status in pod.get("status", {}).get("containerStatuses", [])
            if status.get("name") == target.container
        ]
        if len(matches) != 1:
            raise MonitorError(
                f"{pod['metadata']['name']} has {len(matches)} statuses for {target.container}"
            )
        status = matches[0]
        state = status.get("state", {})
        waiting_reason = state.get("waiting", {}).get("reason")
        statuses.append(
            {
                "uid": pod["metadata"]["uid"],
                "name": pod["metadata"]["name"],
                "phase": pod.get("status", {}).get("phase"),
                "ready": bool(status.get("ready")),
                "image": status.get("image"),
                "restarts": int(status.get("restartCount", 0)),
                "waiting": waiting_reason,
                "terminated": state.get("terminated"),
                "last_terminated": status.get("lastState", {}).get("terminated"),
            }
        )
    return statuses


def initial_state(target: Target) -> InitialState:
    item = workload(target)
    pods = active_pod_statuses(target, item)
    return InitialState(
        generation=int(item["metadata"].get("generation", 0)),
        image=template_image(item, target.container),
        pod_uids={pod["uid"] for pod in pods},
        restarts={pod["uid"]: pod["restarts"] for pod in pods},
    )


def desired_replicas(item: dict[str, Any]) -> int:
    return int(item.get("spec", {}).get("replicas", 0))


def workload_health(target: Target, item: dict[str, Any]) -> tuple[bool, str]:
    generation = int(item["metadata"].get("generation", 0))
    status = item.get("status", {})
    observed = int(status.get("observedGeneration", 0))
    desired = desired_replicas(item)
    updated = int(status.get("updatedReplicas", 0))
    ready = int(status.get("readyReplicas", 0))

    failures: list[str] = []
    if observed != generation:
        failures.append(f"generation observed={observed} current={generation}")
    if updated < desired:
        failures.append(f"updated={updated} desired={desired}")
    if ready < desired:
        failures.append(f"ready={ready} desired={desired}")

    if target.kind == "deployment":
        available = int(status.get("availableReplicas", 0))
        unavailable = int(status.get("unavailableReplicas", 0))
        if available < desired:
            failures.append(f"available={available} desired={desired}")
        if unavailable != 0:
            failures.append(f"unavailable={unavailable}")
    else:
        current = int(status.get("currentReplicas", 0))
        if current < desired:
            failures.append(f"current={current} desired={desired}")
        if status.get("currentRevision") != status.get("updateRevision"):
            failures.append("currentRevision differs from updateRevision")

    return not failures, ", ".join(failures) if failures else "healthy"


def validate_pods(target: Target, item: dict[str, Any]) -> list[dict[str, Any]]:
    pods = active_pod_statuses(target, item)
    desired = desired_replicas(item)
    if len(pods) < desired:
        raise MonitorError(f"{target.display}: active pods={len(pods)} desired={desired}")
    for pod in pods:
        if pod["image"] != target.image:
            raise MonitorError(
                f"{target.display}: {pod['name']} uses {pod['image']}, expected {target.image}"
            )
        if not pod["ready"] or pod["phase"] != "Running":
            raise MonitorError(
                f"{target.display}: {pod['name']} phase={pod['phase']} ready={pod['ready']}"
            )
        if pod["waiting"] in FATAL_WAITING_REASONS:
            raise MonitorError(
                f"{target.display}: {pod['name']} waiting={pod['waiting']}"
            )
        if pod["terminated"] is not None:
            raise MonitorError(
                f"{target.display}: {pod['name']} target container is terminated"
            )
    return pods


def diagnostics(target: Target) -> None:
    print(f"\n--- diagnostics for {target.display} ---", file=sys.stderr)
    item_result = run(
        "kubectl", "get", target.kind, target.name, "-n", target.namespace, "-o", "json",
        check=False,
    )
    if item_result.returncode != 0:
        print(item_result.stderr, file=sys.stderr)
        return
    item = json.loads(item_result.stdout)
    selector = selector_for(item)
    for command in (
        ("kubectl", "describe", target.kind, target.name, "-n", target.namespace),
        ("kubectl", "get", "pods", "-n", target.namespace, "-l", selector, "-o", "wide"),
    ):
        result = run(*command, check=False)
        print(result.stdout[-12000:], file=sys.stderr)
        if result.stderr:
            print(result.stderr[-4000:], file=sys.stderr)
    try:
        pods = active_pod_statuses(target, item)
    except MonitorError as error:
        print(error, file=sys.stderr)
        return
    for pod in pods:
        if pod["restarts"] > 0 or pod["waiting"] or not pod["ready"]:
            for previous in (False, True):
                command = [
                    "kubectl", "logs", "-n", target.namespace, pod["name"],
                    "-c", target.container, "--tail=100",
                ]
                if previous:
                    command.append("--previous")
                result = run(*command, check=False)
                label = "previous" if previous else "current"
                print(f"--- {pod['name']} {label} logs ---", file=sys.stderr)
                print((result.stdout or result.stderr)[-12000:], file=sys.stderr)


def monitor(args: argparse.Namespace) -> int:
    context = run("kubectl", "config", "current-context").stdout.strip()
    print(f"Kubernetes context: {context}")
    if args.expected_context and context != args.expected_context:
        raise MonitorError(
            f"current context {context!r} does not match expected {args.expected_context!r}"
        )

    targets: list[Target] = args.target
    states = {target: initial_state(target) for target in targets}
    for target in targets:
        state = states[target]
        print(
            f"Captured {target.display}: generation={state.generation} "
            f"image={state.image} activePods={len(state.pod_uids)}"
        )

    print(f"\nPHASE 1/3: waiting up to {args.wait_timeout}s for exact pod-template images")
    deadline = time.monotonic() + args.wait_timeout
    while True:
        pending: list[str] = []
        for target in targets:
            item = workload(target)
            image = template_image(item, target.container)
            if image != target.image:
                pending.append(f"{target.display} (current {image})")
        if not pending:
            break
        if time.monotonic() >= deadline:
            raise MonitorError("timed out waiting for images: " + "; ".join(pending))
        print("Waiting: " + "; ".join(pending))
        time.sleep(args.poll_seconds)

    if args.require_change:
        unchanged: list[str] = []
        for target in targets:
            item = workload(target)
            pods = active_pod_statuses(target, item)
            state = states[target]
            changed = (
                state.image != target.image
                or int(item["metadata"].get("generation", 0)) > state.generation
                or {pod["uid"] for pod in pods} != state.pod_uids
            )
            if not changed:
                unchanged.append(target.display)
        if unchanged:
            raise MonitorError("no redeployment observed for: " + "; ".join(unchanged))

    print(f"\nPHASE 2/3: polling Kubernetes rollout and startup state")
    rollout_deadline = time.monotonic() + args.rollout_timeout
    rollout_warnings_by_pod: dict[tuple[Target, str], str] = {}
    rollout_poll = 0
    while True:
        pending: list[str] = []
        for target in targets:
            item = workload(target)
            pods = active_pod_statuses(target, item)
            for pod in pods:
                if pod["image"] != target.image:
                    continue
                if pod["waiting"] in FATAL_WAITING_REASONS:
                    raise MonitorError(
                        f"{target.display}: {pod['name']} waiting={pod['waiting']}"
                    )
                if pod["restarts"] > 0:
                    is_new = pod["uid"] not in states[target].pod_uids
                    provenance = "new rollout pod" if is_new else "active pod"
                    warning = (
                        f"{target.display}: {provenance} {pod['name']} has restarted "
                        f"{pod['restarts']} time(s); last termination={pod['last_terminated']}"
                    )
                    rollout_warnings_by_pod[(target, pod["uid"])] = warning
                    if args.fail_on_rollout_restarts and is_new:
                        raise MonitorError(
                            f"{target.display}: rollout pod {pod['name']} restarted during startup"
                        )
            healthy, reason = workload_health(target, item)
            if healthy:
                try:
                    validate_pods(target, item)
                except MonitorError as error:
                    pending.append(str(error))
            else:
                pending.append(f"{target.name}: {reason}")
        if not pending:
            break
        if time.monotonic() >= rollout_deadline:
            raise MonitorError("timed out waiting for rollout: " + "; ".join(pending))
        print(f"rollout poll {rollout_poll}: " + "; ".join(pending))
        rollout_poll += 1
        time.sleep(args.poll_seconds)

    # Confirm Kubernetes' native rollout predicate after our pod-by-pod polling.
    for target in targets:
        result = run(
            "kubectl", "rollout", "status", target.ref, "-n", target.namespace,
            "--timeout=30s", check=False,
        )
        if result.returncode != 0:
            raise MonitorError(result.stderr.strip() or f"rollout failed for {target.display}")
        print(result.stdout.strip())

    restart_baselines: dict[Target, dict[str, int]] = {}
    for target in targets:
        item = workload(target)
        pods = validate_pods(target, item)
        restart_baselines[target] = {pod["uid"]: pod["restarts"] for pod in pods}
        for pod in pods:
            if pod["restarts"] == 0:
                continue
            key = (target, pod["uid"])
            if key not in rollout_warnings_by_pod:
                provenance = (
                    "new rollout pod"
                    if pod["uid"] not in states[target].pod_uids
                    else "active pod"
                )
                rollout_warnings_by_pod[key] = (
                    f"{target.display}: {provenance} {pod['name']} has restarted "
                    f"{pod['restarts']} time(s); last termination={pod['last_terminated']}"
                )

    rollout_warnings = list(rollout_warnings_by_pod.values())
    for warning in rollout_warnings:
        print("WARNING: " + warning, file=sys.stderr)

    stability = args.stability_seconds
    finish_at = dt.datetime.now().astimezone() + dt.timedelta(seconds=stability)
    print(
        f"\nPHASE 3/3: rollout is complete; intentionally monitoring a "
        f"{stability}s stability window until {finish_at.strftime('%H:%M:%S %Z')}"
    )
    start = time.monotonic()
    poll = 0
    while True:
        summaries: list[str] = []
        for target in targets:
            item = workload(target)
            if template_image(item, target.container) != target.image:
                raise MonitorError(f"{target.display}: workload image regressed")
            healthy, reason = workload_health(target, item)
            if not healthy:
                raise MonitorError(f"{target.display}: {reason}")
            pods = validate_pods(target, item)
            baseline = restart_baselines[target]
            for pod in pods:
                if pod["uid"] not in baseline:
                    if pod["restarts"] != 0:
                        raise MonitorError(
                            f"{target.display}: new pod {pod['name']} first observed with "
                            f"{pod['restarts']} restart(s)"
                        )
                    baseline[pod["uid"]] = 0
                elif pod["restarts"] != baseline[pod["uid"]]:
                    raise MonitorError(
                        f"{target.display}: {pod['name']} restarts changed from "
                        f"{baseline[pod['uid']]} to {pod['restarts']}"
                    )
            summaries.append(
                f"{target.name} ready={item.get('status', {}).get('readyReplicas', 0)}/"
                f"{desired_replicas(item)} pods={len(pods)} "
                f"restarts={sum(pod['restarts'] for pod in pods)}"
            )
        elapsed = int(time.monotonic() - start)
        remaining = max(0, stability - elapsed)
        print(f"stability poll {poll}: elapsed={elapsed}s remaining={remaining}s; " + "; ".join(summaries))
        if elapsed >= stability:
            break
        poll += 1
        time.sleep(min(args.poll_seconds, remaining))

    print("\nSUCCESS: exact images are fully rolled out and restart counts stayed stable.")
    if rollout_warnings:
        print("Rollout warnings:")
        for warning in rollout_warnings:
            print(f"- {warning}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--target", action="append", type=parse_target, required=True,
        help="repeatable: namespace/kind/name:container=image",
    )
    parser.add_argument("--expected-context", help="fail rather than switching context")
    parser.add_argument("--wait-timeout", type=int, default=900)
    parser.add_argument("--rollout-timeout", type=int, default=900)
    parser.add_argument("--stability-seconds", type=int, default=300)
    parser.add_argument("--poll-seconds", type=int, default=15)
    parser.add_argument(
        "--require-change", action="store_true",
        help="require generation, image, or pod UIDs to change after startup",
    )
    parser.add_argument(
        "--fail-on-rollout-restarts", action="store_true",
        help="fail if a newly rolled-out pod restarted before the stability window",
    )
    args = parser.parse_args()
    if min(args.wait_timeout, args.rollout_timeout) <= 0:
        parser.error("timeouts must be positive")
    if args.stability_seconds < 0 or args.poll_seconds <= 0:
        parser.error("stability must be non-negative and poll interval positive")

    try:
        return monitor(args)
    except KeyboardInterrupt:
        print("\nMonitoring interrupted by user; no cluster mutation was performed.", file=sys.stderr)
        return 130
    except MonitorError as error:
        print(f"\nFAILURE: {error}", file=sys.stderr)
        for target in args.target:
            diagnostics(target)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
