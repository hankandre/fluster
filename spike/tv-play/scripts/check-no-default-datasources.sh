#!/usr/bin/env bash
# Fails if the native player source could build a data source other than the shared OkHttp client:
# DefaultHttpDataSource (follows up to 20 redirects), DefaultDataSource(.Factory), a
# DefaultMediaSourceFactory built from a Context (it makes a DefaultDataSource internally), or an
# ExoPlayer.Builder without Octave's media source factory.
set -euo pipefail
src="$(cd "$(dirname "$0")/.." && pwd)/modules/octave-player/android/src"
fail=0
check() {
  local what="$1" pattern="$2"
  if grep -RnE --include='*.kt' --include='*.java' "$pattern" "$src"; then
    echo "FORBIDDEN: $what" >&2
    fail=1
  fi
}
check "DefaultHttpDataSource" 'DefaultHttpDataSource'
check "DefaultDataSource" 'DefaultDataSource([^a-zA-Z]|$)|DefaultDataSourceFactory'
check "DefaultMediaSourceFactory(context)" 'DefaultMediaSourceFactory\((this|context|ctx|[a-zA-Z]*[cC]ontext)\b'
check "ExoPlayer.Builder(context) without a media source factory" 'ExoPlayer\.Builder\([^,()]*\)'
check "setDataSourceFactory" 'setDataSourceFactory'
# Every ExoPlayer.Builder call must pass a media source factory as an argument.
if grep -RnE --include='*.kt' 'ExoPlayer\.Builder\(' "$src" | grep -vE 'ExoPlayer\.Builder\([^)]*,[^)]*[mM]ediaSourceFactory\)'; then
  echo "FORBIDDEN: ExoPlayer.Builder without mediaSourceFactory argument" >&2
  fail=1
fi
[ "$fail" = 0 ] && echo "datasource check: OK (only OkHttpDataSource over the shared client)"
exit "$fail"
