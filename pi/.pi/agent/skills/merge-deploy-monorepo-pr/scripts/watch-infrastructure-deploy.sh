#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "usage: $0 <infrastructure-main-sha>" >&2
  exit 2
}

[[ $# -eq 1 ]] || usage
sha=$1
repo=wesprint-io/infrastructure
workflow_path=.github/workflows/main.yaml
run_json=$(mktemp)
trap 'rm -f "$run_json"' EXIT

run_id=
for _ in $(seq 1 180); do
  runs=$(gh api "repos/$repo/actions/runs?branch=main&event=push&per_page=100")
  run_id=$(jq -r --arg sha "$sha" --arg path "$workflow_path" '
    .workflow_runs[] | select(.head_sha == $sha and .path == $path) | .id
  ' <<<"$runs" | head -1)
  [[ -n "$run_id" ]] && break
  echo "Waiting for infrastructure Pulumi run at $sha..."
  sleep 5
done
[[ -n "$run_id" ]]

gh run watch "$run_id" --repo "$repo" --exit-status --interval 15
gh run view "$run_id" --repo "$repo" \
  --json status,conclusion,url,headSha,event,headBranch,name,jobs >"$run_json"

jq -e --arg sha "$sha" '
  .status == "completed" and
  .conclusion == "success" and
  .headSha == $sha and
  .event == "push" and
  .headBranch == "main" and
  .name == "Pulumi" and
  any(.jobs[];
    .name == "Deployment" and
    .status == "completed" and
    .conclusion == "success" and
    any(.steps[]; .name == "Reject stale runs" and .status == "completed" and .conclusion == "success") and
    any(.steps[]; .name == "Pulumi up" and .status == "completed" and .conclusion == "success")
  )
' "$run_json" >/dev/null

jq --argjson runId "$run_id" '{runId:$runId,workflowRunUrl:.url,headSha,status,conclusion,deploymentJob:(.jobs[]|select(.name=="Deployment")|{databaseId,status,conclusion})}' "$run_json"
