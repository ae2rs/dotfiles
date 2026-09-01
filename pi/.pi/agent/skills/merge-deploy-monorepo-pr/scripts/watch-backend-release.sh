#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "usage: $0 <monorepo-main-sha> <backend-image-name>" >&2
  echo "example: $0 e5cf528bbe4ca270ef10d4dfe011d6d445a32032 main" >&2
  exit 2
}

[[ $# -eq 2 ]] || usage
sha=$1
image_name=$2
repo=wesprint-io/monorepo
workflow_path=.github/workflows/backend_release_main.yaml
run_json=$(mktemp)
log_file=$(mktemp)
trap 'rm -f "$run_json" "$log_file"' EXIT

run_id=
for _ in $(seq 1 180); do
  runs=$(gh api "repos/$repo/actions/runs?branch=main&event=push&per_page=100")
  run_id=$(jq -r --arg sha "$sha" --arg path "$workflow_path" '
    .workflow_runs[] | select(.head_sha == $sha and .path == $path) | .id
  ' <<<"$runs" | head -1)
  [[ -n "$run_id" ]] && break
  echo "Waiting for Backend: release main run at $sha..."
  sleep 5
done
[[ -n "$run_id" ]]

gh run watch "$run_id" --repo "$repo" --exit-status --interval 10
gh run view "$run_id" --repo "$repo" \
  --json status,conclusion,url,headSha,event,headBranch,name,jobs >"$run_json"

jq -e --arg sha "$sha" '
  .status == "completed" and
  .conclusion == "success" and
  .headSha == $sha and
  .event == "push" and
  .headBranch == "main" and
  .name == "Backend: release main" and
  any(.jobs[]; .name == "backend_release" and .status == "completed" and .conclusion == "success")
' "$run_json" >/dev/null

job_id=$(jq -r '.jobs[] | select(.name == "backend_release") | .databaseId' "$run_json")
for _ in $(seq 1 30); do
  if gh run view "$run_id" --repo "$repo" --job "$job_id" --log >"$log_file" 2>/dev/null; then
    break
  fi
  sleep 5
done
[[ -s "$log_file" ]]

hashes=$(awk -F '\t' '$2 == "Metadata" {print $0}' "$log_file" \
  | grep -Eo 'backend/[A-Za-z0-9_.-]+:[0-9a-f]{7,40}$' \
  | sed -E 's/.*://' \
  | sort -u)
hash_count=$(grep -c . <<<"$hashes" || true)
if [[ "$hash_count" -ne 1 ]]; then
  echo "Metadata did not expose exactly one image hash: ${hashes:-<none>}" >&2
  exit 1
fi
hash=$hashes

if ! awk -F '\t' '$2 == "Metadata" {print $0}' "$log_file" \
  | grep -Eq "backend/${image_name}:${hash}$"; then
  # GitHub truncates the large Metadata notice. The hash still comes from
  # Metadata; this only proves the selected image was built with that hash.
  if ! awk -F '\t' '$2 == "Build" {print $0}' "$log_file" \
    | grep -Eq "backend/${image_name}:${hash}$"; then
    echo "Selected image backend/$image_name:$hash is absent from Metadata and Build logs" >&2
    exit 1
  fi
fi

jq -n \
  --argjson runId "$run_id" \
  --arg url "$(jq -r .url "$run_json")" \
  --arg sha "$sha" \
  --arg image "$image_name" \
  --arg hash "$hash" \
  '{runId:$runId,url:$url,headSha:$sha,image:$image,metadataHash:$hash}'
