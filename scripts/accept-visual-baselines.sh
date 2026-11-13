#!/usr/bin/env bash
# Copies the PNGs of a CI run's visual-captures artifact into e2e/visual/baselines/.
# Never commits: review the contact sheet, then commit the baselines with the UI change.
set -euo pipefail

if [ "$#" -ne 1 ] || ! [[ "$1" =~ ^[0-9]+$ ]]; then
  echo "usage: pnpm test:visual:accept <run-id>" >&2
  exit 2
fi

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

gh run download "$1" -n visual-captures -D "$tmp"

# Only size directories are allowed, plus an optional index.html contact sheet.
for entry in "$tmp"/*; do
  name="$(basename "$entry")"
  if [ -d "$entry" ] && [[ "$name" =~ ^[0-9]+x[0-9]+$ ]]; then continue; fi
  if [ -f "$entry" ] && [ "$name" = "index.html" ]; then continue; fi
  echo "unexpected entry in artifact: $name" >&2
  exit 1
done

mkdir -p "$root/e2e/visual/baselines"
rsync -a --delete --include='*/' --include='*.png' --exclude='*' "$tmp/" "$root/e2e/visual/baselines/"
git -C "$root" status --short e2e/visual/baselines
