#!/usr/bin/env bash
# Wait for the first `Backend: release` push run on main that contains a merge
# commit, then print the image hash it published as JSON on stdout.
set -euo pipefail

usage() {
	echo "usage: $0 <monorepo-merge-sha> <backend-image-name>" >&2
	echo "example: $0 e5cf528bbe4ca270ef10d4dfe011d6d445a32032 main" >&2
	exit 2
}

[[ $# -eq 2 ]] || usage
image_name=$2
repo=wesprint-io/monorepo
workflow=backend_release.yaml
run_json=$(mktemp)
log_file=$(mktemp)
trap 'rm -f "$run_json" "$log_file"' EXIT

commit=$(gh api "repos/$repo/commits/$1" --jq '"\(.sha) \(.commit.committer.date)"')
read -r sha merged_at <<<"$commit"

contains_merge() {
	[[ "$1" == "$sha" ]] && return 0
	local status
	status=$(gh api "repos/$repo/compare/$sha...$1" --jq .status)
	[[ "$status" == ahead || "$status" == identical ]]
}

# A stack merge pushes several commits at once and only the tip gets a run, and
# a newer pending run cancels an older one. Either way the oldest uncancelled
# run whose head contains the merge commit is the one that released it.
find_run() {
	local id head
	while read -r id head; do
		if contains_merge "$head"; then
			echo "$id $head"
			return
		fi
	done < <(gh api -X GET "repos/$repo/actions/workflows/$workflow/runs" \
		-f event=push -f branch=main -f created=">=$merged_at" -f per_page=100 \
		--jq '.workflow_runs | sort_by(.created_at) | .[]
			| select(.conclusion != "cancelled") | "\(.id) \(.head_sha)"')
}

deadline=$((SECONDS + 900))
while :; do
	run=$(find_run)
	if [[ -z "$run" ]]; then
		if ((SECONDS >= deadline)); then
			echo "No $workflow push run on main contains $sha after 15 minutes." >&2
			echo "The workflow only runs on pushes that touch its paths filter; check that the merge changed a backend path." >&2
			exit 1
		fi
		echo "Waiting for a Backend: release run containing $sha..." >&2
		sleep 10
		continue
	fi
	read -r run_id run_head <<<"$run"
	echo "Watching run $run_id at $run_head" >&2
	gh run watch "$run_id" --repo "$repo" --exit-status --interval 10 >&2 || true
	gh run view "$run_id" --repo "$repo" \
		--json status,conclusion,url,headSha,event,headBranch,name,jobs >"$run_json"
	[[ "$(jq -r .conclusion "$run_json")" == cancelled ]] || break
	echo "Run $run_id was cancelled; looking for the next run containing $sha..." >&2
done

if ! jq -e --arg head "$run_head" '
  .status == "completed" and
  .conclusion == "success" and
  .headSha == $head and
  .event == "push" and
  .headBranch == "main" and
  .name == "Backend: release" and
  any(.jobs[]; .name == "backend_release" and .status == "completed" and .conclusion == "success")
' "$run_json" >/dev/null; then
	echo "Run $run_id did not succeed: $(jq -c '{conclusion,url}' "$run_json")" >&2
	exit 1
fi

# `gh run view --log` can label every line UNKNOWN STEP, so read the Metadata
# step's notice from the job's annotations and the Push step from the raw log.
job_id=$(jq -r '.jobs[] | select(.name == "backend_release") | .databaseId' "$run_json")
images=$(gh api "repos/$repo/check-runs/$job_id/annotations" \
	--jq '.[] | select(.title == "containers images") | .message')

hashes=$({ grep -Eo 'backend/[A-Za-z0-9_.-]+:[0-9a-f]{7,40}$' <<<"$images" || true; } \
	| sed -E 's/.*://' | sort -u)
hash_count=$(grep -c . <<<"$hashes" || true)
if [[ "$hash_count" -ne 1 ]]; then
	echo "Metadata did not expose exactly one image hash: ${hashes:-<none>}" >&2
	exit 1
fi
hash=$hashes

# GitHub truncates the Metadata notice at about 64 KB, so a late image such as
# `main` may be missing from it. Then require Push to have pushed it with that hash.
if ! grep -Eq "/backend/${image_name}:${hash}\$" <<<"$images"; then
	for _ in $(seq 1 30); do
		gh api --allow-escape-sequences "repos/$repo/actions/jobs/$job_id/logs" >"$log_file" 2>/dev/null && break
		sleep 5
	done
	if ! grep -Fq "/backend/${image_name}:${hash}: digest: sha256:" "$log_file"; then
		echo "backend/$image_name:$hash is absent from the Metadata notice and was not pushed" >&2
		exit 1
	fi
fi

jq -n \
	--argjson runId "$run_id" \
	--arg url "$(jq -r .url "$run_json")" \
	--arg mergeSha "$sha" \
	--arg runHeadSha "$run_head" \
	--argjson exact "$([[ "$run_head" == "$sha" ]] && echo true || echo false)" \
	--arg image "$image_name" \
	--arg hash "$hash" \
	'{runId:$runId,url:$url,mergeSha:$mergeSha,runHeadSha:$runHeadSha,exact:$exact,image:$image,metadataHash:$hash}'
