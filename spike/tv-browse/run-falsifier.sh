#!/usr/bin/env bash
# Runs the browse-falsifier measurements against one adb device.
#
#   [FALSIFIER_BURST=...] ./run-falsifier.sh <adb-serial> [apk] [what] [label]
#
#   adb-serial  from `adb devices` (emulator-5554, or <shield-ip>:5555 after `adb connect`)
#   apk         optional; installed first (default: dist/browse-falsifier.apk)
#   what        all (default) | focus | frames | memory | coldstart
#   FALSIFIER_BURST=oneshot (env) sends each burst in one call: a stress test, not a held key.
#   FALSIFIER_PKG, FALSIFIER_TAG, FALSIFIER_PORT, FALSIFIER_RESULTS (env) point the same driver at
#   another app (package, logcat tag, art port, results folder); the defaults are this app's.
#   FALSIFIER_SKIP_INSTALL=1 (env) keeps the installed APK (and its compiled code) as it is.
#   label       optional results label (default: the device model). The serial is never
#               written to disk, because for a network device it is the device's address.
#
# Needs: adb, python3, node, and generated art (`node scripts/generate-art.mjs` once).
# The art server listens on 127.0.0.1 only; `adb reverse` tunnels the device's
# 127.0.0.1:8737 to it, so no LAN address is used or recorded.
set -euo pipefail

serial="${1:?usage: run-falsifier.sh <adb-serial> [apk] [what] [label]}"
here="$(cd "$(dirname "$0")" && pwd)"
apk="${2:-$here/dist/browse-falsifier.apk}"
what="${3:-all}"
pkg="${FALSIFIER_PKG:-dev.fluster.spike.browse}"
tag="${FALSIFIER_TAG:-ReactNativeJS}"
port="${FALSIFIER_PORT:-8737}"
devport="${FALSIFIER_DEVICE_PORT:-$port}"  # the app's port; differs from $port only to share a host
stamp="$(date +%Y%m%d-%H%M%S)"
model="$(adb -s "$serial" shell getprop ro.product.model | tr -cd 'A-Za-z0-9_-')"
label="${4:-$model}"
out="${FALSIFIER_RESULTS:-$here/results}/${label}-$(basename "$apk" .apk)-$stamp"
mkdir -p "$out"

if [ ! -d "$here/art/poster/300" ]; then
  echo "no art; run: node scripts/generate-art.mjs" >&2
  exit 1
fi

adb -s "$serial" get-state >/dev/null
if [ -f "$apk" ] && [ -z "${FALSIFIER_SKIP_INSTALL:-}" ]; then
  adb -s "$serial" install -r "$apk"
fi
# Start from an empty image cache so the art server, decode and disk cache are exercised.
adb -s "$serial" shell pm clear "$pkg" >/dev/null

node "$here/scripts/serve-art.mjs" "$port" > "$out/art-server.log" 2>&1 &
server=$!
trap 'kill $server 2>/dev/null || true; adb -s "$serial" reverse --remove tcp:$devport 2>/dev/null || true' EXIT
adb -s "$serial" reverse "tcp:$devport" "tcp:$port"
sleep 1

python3 "$here/scripts/falsifier.py" "$what" --serial "$serial" --pkg "$pkg" --tag "$tag" --out "$out" | tee "$out/summary.txt"
kill -TERM $server 2>/dev/null || true
sleep 1
echo "art server: $(tail -1 "$out/art-server.log")" | tee -a "$out/summary.txt"
echo "results in $out"
