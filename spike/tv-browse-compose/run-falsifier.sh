#!/usr/bin/env bash
# Runs the React Native spike's falsifier (spike/tv-browse/run-falsifier.sh and
# scripts/falsifier.py, unchanged in method) against the Compose baseline.
#
#   ./run-falsifier.sh <adb-serial> [apk] [what] [label]
#
# Same arguments as the shared script. Differences, all through its env switches:
#   package dev.fluster.spike.browsecompose, logcat tag FlusterBrowse,
#   art port 8738 (the React Native app uses 8737; both spikes can share a device),
#   results in spike/tv-browse-compose/results.
# Art: spike/tv-browse/art (copied from the React Native worktree, not regenerated).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
serial="${1:?usage: run-falsifier.sh <adb-serial> [apk] [what] [label]}"
apk="${2:-$here/dist/browse-compose.apk}"
export FALSIFIER_PKG=dev.fluster.spike.browsecompose
export FALSIFIER_TAG=FlusterBrowse
export FALSIFIER_PORT="${FALSIFIER_HOST_PORT:-8738}"  # host side; the app always uses 8738
export FALSIFIER_DEVICE_PORT=8738
export FALSIFIER_RESULTS="$here/results"
exec "$here/../tv-browse/run-falsifier.sh" "$serial" "$apk" "${3:-all}" "${4:-}"
