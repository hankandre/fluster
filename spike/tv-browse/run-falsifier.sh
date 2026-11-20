#!/usr/bin/env bash
# Runs the browse-falsifier measurements against one adb device.
#
#   [FALSIFIER_BURST=...] ./run-falsifier.sh <adb-serial> [apk] [what] [label]
#
#   adb-serial  from `adb devices` (emulator-5554, or <shield-ip>:5555 after `adb connect`)
#   apk         optional; installed first (default: dist/browse-falsifier.apk)
#   what        all (default) | focus | frames | memory | coldstart
#   FALSIFIER_BURST=oneshot (env) sends each burst in one call: a stress test, not a held key.
#   FALSIFIER_COMPILE=speed-profile (env) warms the app up, then compiles it with ART's
#               speed-profile filter before measuring: the steady state a user's device reaches
#               (or a shipped Baseline Profile gives). Default: as installed by adb (JIT only).
#   FLUSTER_ARM (env) a JSON object of arm flags (src/arm.ts), served to the app as /config.json.
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
port=8737
stamp="$(date +%Y%m%d-%H%M%S)"
model="$(adb -s "$serial" shell getprop ro.product.model | tr -cd 'A-Za-z0-9_-')"
label="${4:-$model}"
out="$here/results/${label}-$(basename "$apk" .apk)-$stamp"
mkdir -p "$out"

if [ ! -d "$here/art/poster/300" ]; then
  echo "no art; run: node scripts/generate-art.mjs" >&2
  exit 1
fi

adb -s "$serial" get-state >/dev/null
if [ -f "$apk" ]; then
  adb -s "$serial" install -r "$apk"
fi
node "$here/scripts/serve-art.mjs" "$port" > "$out/art-server.log" 2>&1 &
server=$!
trap 'kill $server 2>/dev/null || true; adb -s "$serial" reverse --remove tcp:$port 2>/dev/null || true' EXIT
adb -s "$serial" reverse "tcp:$port" "tcp:$port"
sleep 1

if [ "${FALSIFIER_COMPILE:-}" = "speed-profile" ]; then
  python3 "$here/scripts/falsifier.py" warmup --serial "$serial" --out "$out" >/dev/null
  adb -s "$serial" shell am force-stop dev.fluster.spike.browse
  adb -s "$serial" shell cmd package compile -m speed-profile -f dev.fluster.spike.browse
fi
# Start from an empty image cache so the art server, decode and disk cache are exercised.
# (pm clear removes app data only; the compiled code above stays.)
adb -s "$serial" shell pm clear dev.fluster.spike.browse >/dev/null
# Restart the art server so its served-image count covers the measured run only.
kill $server 2>/dev/null || true
sleep 0.5
node "$here/scripts/serve-art.mjs" "$port" > "$out/art-server.log" 2>&1 &
server=$!
sleep 1

python3 "$here/scripts/falsifier.py" "$what" --serial "$serial" --out "$out" | tee "$out/summary.txt"
kill -TERM $server 2>/dev/null || true
sleep 1
echo "art server: $(tail -1 "$out/art-server.log")" | tee -a "$out/summary.txt"
echo "results in $out"
