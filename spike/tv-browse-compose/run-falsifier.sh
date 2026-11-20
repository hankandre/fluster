#!/usr/bin/env bash
# Runs the React Native spike's falsifier (spike/tv-browse/run-falsifier.sh and
# scripts/falsifier.py, same method) against the Compose baseline.
#
#   [FALSIFIER_COMPILE=speed-profile] ./run-falsifier.sh <adb-serial> [apk] [what] [label]
#
# Same arguments as the shared script. Differences, all through its env switches:
#   package dev.fluster.spike.browsecompose, logcat tag FlusterBrowse,
#   art on device port 8738 (the React Native app uses 8737); FALSIFIER_HOST_PORT moves the
#   host side when two runs share a host; results in spike/tv-browse-compose/results.
# FALSIFIER_COMPILE=speed-profile installs the APK, launches it once so profileinstaller writes
#   the baseline profiles the libraries ship, compiles with `cmd package compile -m speed-profile`,
#   and runs without reinstalling. Without it the APK is installed as adb leaves it (verify only).
# Each run's dexopt status is saved as dexopt.txt in its results folder.
# Art: spike/tv-browse/art (copied from the React Native worktree, not regenerated).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
serial="${1:?usage: run-falsifier.sh <adb-serial> [apk] [what] [label]}"
apk="${2:-$here/dist/browse-compose.apk}"
pkg=dev.fluster.spike.browsecompose
export FALSIFIER_PKG=$pkg
export FALSIFIER_TAG=FlusterBrowse
export FALSIFIER_PORT="${FALSIFIER_HOST_PORT:-8738}"
export FALSIFIER_DEVICE_PORT=8738
export FALSIFIER_RESULTS="$here/results"
if [ "${FALSIFIER_COMPILE:-}" = speed-profile ]; then
  adb -s "$serial" install -r "$apk" >/dev/null
  adb -s "$serial" shell am start -W -n "$pkg/.MainActivity" >/dev/null
  sleep 12
  adb -s "$serial" shell am force-stop "$pkg"
  adb -s "$serial" shell cmd package compile -m speed-profile -f "$pkg"
  export FALSIFIER_SKIP_INSTALL=1
fi
before="$(ls -1 "$FALSIFIER_RESULTS" 2>/dev/null || true)"
"$here/../tv-browse/run-falsifier.sh" "$serial" "$apk" "${3:-all}" "${4:-}"
new="$(comm -13 <(echo "$before" | sort) <(ls -1 "$FALSIFIER_RESULTS" | sort) | tail -1)"
if [ -n "$new" ]; then
  adb -s "$serial" shell dumpsys package dexopt | grep -A3 "\[$pkg\]" | grep status | sed -E 's/~~[^/]*//; s/^ +//' > "$FALSIFIER_RESULTS/$new/dexopt.txt" || true
fi
