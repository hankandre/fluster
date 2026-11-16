#!/usr/bin/env bash
# Copies the captures that failed in a CI run's visual-captures artifact into e2e/visual/baselines/.
# The artifact's results.json says which captures failed; passing captures are never touched.
# Never commits: review the contact sheet, then commit the baselines with the UI change.
set -euo pipefail

dry_run=0
run_id=""
for arg in "$@"; do
  if [ "$arg" = "--dry-run" ]; then
    dry_run=1
  elif [ -z "$run_id" ] && [[ "$arg" =~ ^[0-9]+$ ]]; then
    run_id="$arg"
  else
    run_id=""
    break
  fi
done
if [ -z "$run_id" ]; then
  echo "usage: pnpm test:visual:accept <run-id> [--dry-run]" >&2
  exit 2
fi

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

gh run download "$run_id" -n visual-captures -D "$tmp"

# Only size directories are allowed, plus the contact sheet and the run report.
for entry in "$tmp"/*; do
  name="$(basename "$entry")"
  if [ -d "$entry" ] && [[ "$name" =~ ^[0-9]+x[0-9]+(-tv)?$ ]]; then continue; fi
  if [ -f "$entry" ] && { [ "$name" = "index.html" ] || [ "$name" = "results.json" ]; }; then continue; fi
  echo "unexpected entry in artifact: $name" >&2
  exit 1
done

mkdir -p "$root/e2e/visual/baselines"
args=("$tmp" "$root/e2e/visual/baselines")
if [ "$dry_run" -eq 1 ]; then args+=(--dry-run); fi
node "$root/scripts/visual-accept.mjs" "${args[@]}"
if [ "$dry_run" -eq 0 ]; then
  git -C "$root" status --short e2e/visual/baselines
fi
