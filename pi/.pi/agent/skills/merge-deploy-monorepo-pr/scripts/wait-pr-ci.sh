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

for _ in $(seq 1 120); do
  count=$(gh pr view "$pr" --repo "$repo" --json statusCheckRollup --jq '.statusCheckRollup | length')
  if [[ "$count" -gt 0 ]]; then
    break
  fi
  echo "Waiting for checks to appear on $repo#$pr..."
  sleep 5
done
[[ "${count:-0}" -gt 0 ]]

gh pr checks "$pr" --repo "$repo" --watch --interval 15

# Allow late external checks (notably Pulumi Cloud previews) to attach.
previous_count=-1
stable_polls=0
for _ in $(seq 1 60); do
  json=$(gh pr view "$pr" --repo "$repo" \
    --json state,isDraft,baseRefName,headRefOid,mergeable,mergeStateStatus,statusCheckRollup,url)
  count=$(jq '.statusCheckRollup | length' <<<"$json")
  nonterminal=$(jq '[.statusCheckRollup[] | select(
    (.__typename == "CheckRun" and .status != "COMPLETED") or
    (.__typename == "StatusContext" and (.state == "PENDING" or .state == "EXPECTED"))
  )] | length' <<<"$json")
  bad=$(jq '[.statusCheckRollup[] |
    if .__typename == "CheckRun" then
      select(.conclusion != "SUCCESS" and .conclusion != "SKIPPED" and .conclusion != "NEUTRAL")
    else
      select(.state != "SUCCESS")
    end
  ] | length' <<<"$json")
  [[ "$bad" -eq 0 ]] || break
  if [[ "$count" -eq "$previous_count" && "$nonterminal" -eq 0 ]]; then
    stable_polls=$((stable_polls + 1))
  else
    stable_polls=0
  fi
  [[ "$stable_polls" -ge 2 ]] && break
  previous_count=$count
  sleep 10
done

jq -e --arg head "$expected_head" '
  .state == "OPEN" and
  .isDraft == false and
  .baseRefName == "main" and
  .headRefOid == $head and
  .mergeable == "MERGEABLE" and
  .mergeStateStatus == "CLEAN" and
  ([.statusCheckRollup[] |
    select(
      (.__typename == "CheckRun" and .status != "COMPLETED") or
      (.__typename == "StatusContext" and (.state == "PENDING" or .state == "EXPECTED"))
    )
  ] | length) == 0 and
  ([.statusCheckRollup[] |
    if .__typename == "CheckRun" then
      select(.conclusion != "SUCCESS" and .conclusion != "SKIPPED" and .conclusion != "NEUTRAL")
    else
      select(.state != "SUCCESS")
    end
  ] | length) == 0
' <<<"$json" >/dev/null

jq '{url,headRefOid,mergeable,mergeStateStatus,checks:[.statusCheckRollup[]|{name,status,conclusion,state}]}' <<<"$json"
