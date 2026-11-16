#!/usr/bin/env bash
# Runs a command in a private network namespace that has only loopback, so host
# interface changes (docker, VPN, Wi-Fi, IPv6 address renewal) cannot reach the
# browser and abort its requests with net::ERR_NETWORK_CHANGED.
# Opt-in for local runs of the e2e and visual suites, which use mocks and loopback only.
# Needs unprivileged user namespaces (Linux). CI does not use it.
# Usage: scripts/netns.sh pnpm test:e2e
set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "usage: scripts/netns.sh <command> [args...]" >&2
  exit 2
fi
if ! command -v unshare >/dev/null 2>&1 || ! command -v ip >/dev/null 2>&1; then
  echo "scripts/netns.sh needs unshare and ip (util-linux and iproute2)." >&2
  exit 1
fi

exec unshare --map-root-user --net sh -c 'ip link set lo up && exec "$@"' sh "$@"
