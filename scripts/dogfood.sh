#!/usr/bin/env bash
# Dogfood launcher: runs the desktop app in dev mode with native trace logging
# and writes a redacted copy of the output under release-evidence/dogfood/.
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: pnpm dogfood [--help]

Starts the desktop app with `pnpm tauri dev` and native trace logging.
Output is redacted and written to release-evidence/dogfood/<UTC timestamp>.log.
The log path is printed before the app starts.

Environment:
  FLUSTER_DOGFOOD_SERVER  Optional Jellyfin server URL for this session.
                          Never commit it. Only its host is printed.

Options:
  -h, --help              Print this help and exit without starting anything.
USAGE
}

# Replaces secret values with [redacted]. Reads stdin, writes stdout, unbuffered.
redact_stream() {
  local q="'"
  local key="(x-emby-token|x-mediabrowser-token|api[_-]?key|access[_-]?token|token|password|pw|playsessionid)"
  local sep="([\"${q}]?[[:space:]]*[=:][[:space:]]*)"
  sed -u -E \
    -e 's/(Authorization[[:space:]]*:[[:space:]]*).*/\1[redacted]/Ig' \
    -e 's/(Bearer[[:space:]]+)[^[:space:]"&,;]+/\1[redacted]/Ig' \
    -e 's#(://)[^/[:space:]@]+@#\1[redacted]@#g' \
    -e "s/${key}${sep}\"[^\"]*\"/\1\2[redacted]/Ig" \
    -e "s/${key}${sep}[^\"[:space:]&,;]+/\1\2[redacted]/Ig"
}

# Prints only the host (and port) of a URL: no scheme, credentials, path or query.
server_host() {
  local rest="$1"
  rest="${rest#*://}"
  rest="${rest%%[/?#]*}"
  rest="${rest##*@}"
  printf '%s\n' "$rest"
}

run_dogfood() {
  local stamp log_dir log_file status
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  log_dir="release-evidence/dogfood"
  log_file="$log_dir/$stamp.log"

  mkdir -p "$log_dir"
  echo "Dogfood log: $log_file"
  if [[ -n "${FLUSTER_DOGFOOD_SERVER:-}" ]]; then
    echo "Dogfood server host: $(server_host "$FLUSTER_DOGFOOD_SERVER")"
  fi

  # pipefail would hide tauri's own status behind tee's, so read PIPESTATUS.
  set +e
  pnpm tauri dev 2>&1 | redact_stream | tee "$log_file"
  status="${PIPESTATUS[0]}"
  set -e
  return "$status"
}

main() {
  if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
    usage
    exit 0
  fi
  if [[ $# -gt 0 ]]; then
    usage >&2
    exit 2
  fi

  local repo_root
  repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  cd "$repo_root"
  run_dogfood
}

if [[ "${BASH_SOURCE[0]:-}" == "$0" ]]; then
  main "$@"
fi
