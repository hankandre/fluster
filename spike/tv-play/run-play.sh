#!/usr/bin/env bash
# Runs the play falsifier on one adb device, through the recording proxy.
#
#   [MODE=mock|jellyscale] [TITLE=Alien] [YEAR=1979] [PLAY_SECS=130] [NEGATIVE=redirect-stream] \
#     ./run-play.sh <adb-serial> [label]
#
#   MODE=mock        (default without OCTAVE_JELLYSCALE_URL) a local mock server and media/sample-hdr10.mkv
#   MODE=jellyscale  the server in $OCTAVE_JELLYSCALE_URL, credentials from ~/.config/octave/jellyscale.env
#   NEGATIVE=redirect-stream  the proxy answers every stream request with a 302 to the canary; the
#                    run passes only if playback fails and the canary gets no hit.
#   label            results label (default: the device model). The serial, the server address and the
#                    credentials are never written to disk or printed.
#
# The proxy and canary listen on 127.0.0.1 only; `adb reverse` tunnels the device's 127.0.0.1 ports to
# them, so the app's server origin is http://127.0.0.1:8837 and no LAN address reaches the APK.
set -euo pipefail

serial="${1:?usage: run-play.sh <adb-serial> [label]}"
here="$(cd "$(dirname "$0")" && pwd)"
apk="${APK:-$here/dist/play-falsifier.apk}"
pkg=dev.fluster.spike.play
proxy_port=8837
canary_port=8839
mock_port=8838
title="${TITLE:-Alien}"
year="${YEAR:-1979}"
play_secs="${PLAY_SECS:-130}"
negative="${NEGATIVE:-}"
if [ -n "${OCTAVE_JELLYSCALE_URL:-}" ]; then mode="${MODE:-jellyscale}"; else mode="${MODE:-mock}"; fi
adb_() { adb -s "$serial" "$@"; }

model="$(adb_ shell getprop ro.product.model | tr -cd 'A-Za-z0-9_-')"
label="${2:-$model}"
stamp="$(date +%Y%m%d-%H%M%S)"
slug="$(echo "$title" | tr -cd 'A-Za-z0-9')"
out="$here/results/${label}-${mode}-${slug}${negative:+-$negative}-$stamp"
raw="$out/raw"
mkdir -p "$raw"

# Replaces every IPv4 address but loopback, URLs' query strings, and any Token="..." value.
redact() {
  perl -pe 's/\b(?!127\.0\.0\.1\b)(\d{1,3}\.){3}\d{1,3}\b/<ip>/g; s#https?://[^\s"]*#<url>#g; s/Token="[^"]*"/Token="<redacted>"/g; s/(PlaySessionId|api_key|ApiKey)=[^&\s"]*/$1=<redacted>/gi'
}

# --- Shield guards -----------------------------------------------------------------------------
if [ "$model" = "SHIELD_Android_TV" ]; then
  now="$(TZ=America/Chicago date +%H%M)"
  if [ "$now" -ge 1550 ] && [ "$now" -lt 2300 ]; then
    echo "Shield blackout (15:50-23:00 CST); not touching the Shield." >&2
    exit 3
  fi
fi
for attempt in $(seq 1 21); do
  focus="$(adb_ shell dumpsys window | grep -m1 mCurrentFocus || true)"
  if echo "$focus" | grep -q "dev.fluster.spike.browse"; then
    echo "device busy with the browse spike (attempt $attempt/21); retrying in 2 minutes" >&2
    [ "$attempt" = 21 ] && { echo "gave up after 40 minutes" >&2; exit 4; }
    sleep 120
  else
    break
  fi
done

# --- Upstream and credentials (never printed) --------------------------------------------------
pids=()
cleanup() {
  adb_ shell am force-stop "$pkg" >/dev/null 2>&1 || true
  adb_ shell input keyevent KEYCODE_HOME >/dev/null 2>&1 || true
  adb_ shell svc power stayon false >/dev/null 2>&1 || true
  adb_ reverse --remove "tcp:$proxy_port" >/dev/null 2>&1 || true
  adb_ reverse --remove "tcp:$canary_port" >/dev/null 2>&1 || true
  for p in "${pids[@]}"; do kill -TERM "$p" 2>/dev/null || true; done
  sleep 1
}
trap cleanup EXIT

if [ "$mode" = "mock" ]; then
  sample="$here/media/${SAMPLE:-sample-hdr10}.mkv"
  [ -f "$sample" ] || { echo "no sample; run scripts/make-sample.sh" >&2; exit 1; }
  user=octave
  pass=mock-only
  node "$here/scripts/mock-jellyfin.mjs" "$mock_port" "$sample" > "$raw/mock.log" 2>&1 &
  pids+=($!)
  upstream="http://127.0.0.1:$mock_port"
else
  : "${OCTAVE_JELLYSCALE_URL:?set OCTAVE_JELLYSCALE_URL}"
  env_file="$HOME/.config/octave/jellyscale.env"
  user="$(sed -n 's/^JELLYSCALE_USERNAME=//p' "$env_file" | tr -d '"'"'"'')"
  pass="$(sed -n 's/^JELLYSCALE_PASSWORD=//p' "$env_file" | sed -E "s/^\"(.*)\"$/\1/; s/^'(.*)'$/\1/")"
  upstream="$OCTAVE_JELLYSCALE_URL"
fi

OCTAVE_UPSTREAM="$upstream" node "$here/scripts/wire-proxy.mjs" "$proxy_port" "$canary_port" "$out" ${negative:+--$negative} > "$raw/proxy.log" 2>&1 &
proxy_pid=$!
pids+=($proxy_pid)
sleep 1

# --- Device -----------------------------------------------------------------------------------
adb_ get-state >/dev/null
adb_ install -r "$apk" >/dev/null
adb_ shell pm clear "$pkg" >/dev/null
adb_ reverse "tcp:$proxy_port" "tcp:$proxy_port" >/dev/null
adb_ reverse "tcp:$canary_port" "tcp:$canary_port" >/dev/null
adb_ shell svc power stayon true
adb_ shell input keyevent KEYCODE_WAKEUP
adb_ logcat -c
adb_ shell dumpsys display | redact > "$raw/display-before.txt"

# Device-shell quoting for the password; the command line is never echoed.
q() { printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"; }
adb_ shell am start -W -n "$pkg/.MainActivity" \
  --es octave.server "http://127.0.0.1:$proxy_port" \
  --es octave.user "$(q "$user")" \
  --es octave.pass "$(q "$pass")" \
  --es octave.title "$(q "$title")" \
  --es octave.year "$year" \
  --es octave.canary "http://127.0.0.1:$canary_port" | grep -E "Status|TotalTime|WaitTime" > "$out/am-start.txt" || true
unset pass

# Evidence while playing: wait for the first frame (or an error), then sample.
first=""
for _ in $(seq 1 60); do
  if adb_ logcat -d -s OCTAVE_PLAY | grep -qE "FIRST_FRAME|PLAYER_ERROR"; then first=1; break; fi
  if adb_ logcat -d | grep -q "OCTAVE_JS prepare failed\|OCTAVE_JS plan delivery=hls\|lookup failed"; then break; fi
  sleep 1
done
sleep 10
adb_ shell dumpsys SurfaceFlinger | redact > "$raw/surfaceflinger.txt"
adb_ shell dumpsys display | redact > "$raw/display-playing.txt"
adb_ shell dumpsys media.codec 2>&1 | redact > "$raw/media-codec.txt" || true
adb_ shell dumpsys media.metrics 2>&1 | redact > "$raw/media-metrics.txt" || true
adb_ shell dumpsys media.player 2>&1 | redact > "$raw/media-player.txt" || true
adb_ shell dumpsys gfxinfo "$pkg" 2>&1 | redact > "$raw/gfxinfo.txt" || true
if [ -n "$first" ]; then sleep "$play_secs"; fi

adb_ logcat -d -v threadtime | grep -E "OCTAVE_|ReactNativeJS|ExoPlayer|MediaCodec|CCodec|AndroidRuntime|FATAL|HdrMetadata|hdr" | redact > "$raw/logcat.txt" || true
adb_ logcat -d -s OCTAVE_PLAY OCTAVE_HTTP ReactNativeJS | redact > "$out/app-log.txt" || true

# Tokenless control request straight to the server (D-026): status code only.
item="$(grep -o '"path":"/Videos/[^/]*/stream"' "$out/wire.jsonl" 2>/dev/null | head -1 | sed -E 's#.*/Videos/([^/]*)/stream.*#\1#')"
if [ -n "$item" ]; then
  code="$(curl -s -o /dev/null -m 10 -w '%{http_code}' -r 0-1023 "$upstream/Videos/$item/stream?static=true&mediaSourceId=$item" || true)"
  echo "{\"tokenlessStreamStatus\": $code}" > "$out/control.json"
fi

cleanup
trap - EXIT
wait "$proxy_pid" 2>/dev/null || true

# Summary (no addresses, no secrets).
{
  echo "label=$label mode=$mode title=$title year=$year negative=${negative:-none} play_secs=$play_secs"
  cat "$out/am-start.txt" 2>/dev/null
  grep -hE "OCTAVE_JS|VIDEO_DECODER|VIDEO_FORMAT|AUDIO_|FIRST_FRAME|PLAYER_ERROR|display\[|stats\[|native probes|refused" "$out/app-log.txt" | sed -E 's/^.*(OCTAVE_JS|OCTAVE_PLAY|OCTAVE_HTTP)/\1/' | tail -40
  echo "--- control"; cat "$out/control.json" 2>/dev/null || echo "no stream request seen"
  echo "--- proxy"; tail -1 "$raw/proxy.log"
  echo "--- SurfaceFlinger (HDR / dataspace lines)"
  grep -iE "BT2020|2084|PQ|HDR|dataspace" "$raw/surfaceflinger.txt" | grep -v "^\s*$" | sort | uniq -c | sort -rn | head -15
  echo "--- display (HDR state)"
  grep -ioE "(isHdr[^,]*|mHdrCapabilities[^}]*}|hdrTypes[^]]*]|mActiveColorMode[^,]*|activeMode[^}]*})" "$raw/display-playing.txt" | head -6
} | redact | tee "$out/summary.txt"
echo "results in ${out#$here/}"
