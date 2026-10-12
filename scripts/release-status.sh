#!/usr/bin/env bash
# Read-only companion to docs/production-pipeline.md; never starts a deployment.
set -Eeuo pipefail

repository=KuanKuanya/Daoyou

usage() {
  cat <<'EOF'
Usage: bash scripts/release-status.sh <status|watch> <full-production-sha>

  status  Show the latest production release for this exact commit.
  watch   Wait for that release and require success on the current production head.

Requires GitHub CLI (gh) authenticated to github.com. This script only reads
GitHub; it does not commit, push, merge, rerun jobs, or change the server.
EOF
}

if [[ "${1:-}" == --help || "${1:-}" == -h ]]; then
  usage
  exit 0
fi
if [[ $# -ne 2 || ! "$1" =~ ^(status|watch)$ || ! "$2" =~ ^[0-9a-f]{40}$ ]]; then
  usage >&2
  exit 2
fi
command -v gh >/dev/null || {
  echo 'Missing GitHub CLI (gh). See docs/production-pipeline.md for browser steps.' >&2
  exit 2
}
gh auth status --hostname github.com >/dev/null

mode="$1"
revision="$2"

require_current_revision() {
  local current_revision
  current_revision="$(gh api --hostname github.com \
    "repos/$repository/git/ref/heads/production" --jq '.object.sha')"
  if [[ "$current_revision" != "$revision" ]]; then
    echo "Production head is $current_revision; requested release is $revision." >&2
    echo 'Use status for historical runs; watch the current production commit.' >&2
    exit 1
  fi
}

if [[ "$mode" == watch ]]; then
  require_current_revision
fi

# A push may take a few seconds to appear in Actions. Never match another SHA.
run_id=""
for attempt in 1 2 3 4 5 6; do
  run_id="$(gh run list --repo "$repository" \
    --workflow deploy.yml --branch production --commit "$revision" --limit 100 \
    --json databaseId --jq '.[0].databaseId // empty')"
  if [[ -n "$run_id" || "$mode" == status || "$attempt" == 6 ]]; then
    break
  fi
  sleep 10
done
if [[ ! "$run_id" =~ ^[0-9]+$ ]]; then
  echo "No Production release found for $revision. Check Actions and try again." >&2
  exit 1
fi

echo "Revision: $revision"
echo "Run: https://github.com/$repository/actions/runs/$run_id"

if [[ "$mode" == watch ]]; then
  if ! gh run watch "$run_id" --repo "$repository" --interval 15 --exit-status; then
    echo "Release did not succeed. Inspect logs: gh run view $run_id --repo $repository --log-failed" >&2
    exit 1
  fi
  require_current_revision
fi

gh run view "$run_id" --repo "$repository"
result="$(gh run view "$run_id" --repo "$repository" \
  --json status,conclusion --jq '.status + ":" + .conclusion')"
case "$result" in
  completed:success)
    echo "Production workflow succeeded for $revision. Verify the changed player flow."
    ;;
  completed:*)
    echo "Release result: $result. Inspect logs before retrying." >&2
    exit 1
    ;;
  *)
    echo "Release result: $result; deployment is not confirmed. Use watch to wait."
    if [[ "$mode" == watch ]]; then
      exit 1
    fi
    ;;
esac
