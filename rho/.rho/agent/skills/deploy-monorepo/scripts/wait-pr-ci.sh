#!/usr/bin/env bash
set -euo pipefail

usage() {
	echo "usage: $0 <owner/repo> <pr-number> <expected-head-sha>" >&2
	exit 2
}

[[ $# -eq 3 ]] || usage
repo=$1
pr=$2
expected_head=$3

# Pulumi Cloud can post its preview check after every GitHub job has finished,
# so its absence must not count as green.
required='[]'
if [[ "$repo" == wesprint-io/infrastructure ]]; then
	required='["gke-applications/gke-applications - Update (preview)"]'
fi

summary='
  def done: if .__typename == "CheckRun" then .status == "COMPLETED"
    else .state != "PENDING" and .state != "EXPECTED" end;
  def ok: if .__typename == "CheckRun" then .conclusion == "SUCCESS" or .conclusion == "SKIPPED" or .conclusion == "NEUTRAL"
    else .state == "SUCCESS" end;
  [.statusCheckRollup[] | {name: (.name // .context), done: done, ok: ok}] as $checks
  | {
      count: ($checks | length),
      missing: ($required - [$checks[].name]),
      pending: [$checks[] | select(.done | not) | .name],
      failed: [$checks[] | select(.done and (.ok | not)) | .name]
    }'

for _ in $(seq 1 120); do
	count=$(gh pr view "$pr" --repo "$repo" --json statusCheckRollup --jq '.statusCheckRollup | length')
	if [[ "$count" -gt 0 ]]; then
		break
	fi
	echo "Waiting for checks to appear on $repo#$pr..."
	sleep 5
done
[[ "${count:-0}" -gt 0 ]]

gh pr checks "$pr" --repo "$repo" --watch --fail-fast --interval 5

# Let late external checks attach and settle.
previous_count=-1
for _ in $(seq 1 120); do
	json=$(gh pr view "$pr" --repo "$repo" \
		--json state,isDraft,baseRefName,headRefOid,mergeable,mergeStateStatus,statusCheckRollup,url)
	state=$(jq -c --argjson required "$required" "$summary" <<<"$json")
	jq -e '.failed == []' <<<"$state" >/dev/null || break
	if jq -e --argjson previous "$previous_count" \
		'.missing == [] and .pending == [] and .count == $previous' <<<"$state" >/dev/null; then
		break
	fi
	echo "Waiting for late checks: $state"
	previous_count=$(jq '.count' <<<"$state")
	sleep 5
done

jq --argjson summary "$state" '{
  url, headRefOid, mergeable, mergeStateStatus,
  checks: [.statusCheckRollup[] | {name: (.name // .context), status: (.status // .state), conclusion}],
  missing: $summary.missing, pending: $summary.pending, failed: $summary.failed
}' <<<"$json"

jq -e --arg head "$expected_head" --argjson summary "$state" '
  .state == "OPEN" and
  .isDraft == false and
  .baseRefName == "main" and
  .headRefOid == $head and
  .mergeable == "MERGEABLE" and
  .mergeStateStatus == "CLEAN" and
  $summary.missing == [] and
  $summary.pending == [] and
  $summary.failed == []
' <<<"$json" >/dev/null
