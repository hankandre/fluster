#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this script as root so it can configure APT." >&2
  exit 1
fi

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${repository_root}/release/components.lock"
snapshot_id="${UBUNTU_SNAPSHOT}"
rm -f /etc/apt/sources.list.d/ubuntu.sources
printf 'deb [snapshot=%s] http://archive.ubuntu.com/ubuntu jammy main universe restricted multiverse\n' \
  "${snapshot_id}" > /etc/apt/sources.list
printf 'deb [snapshot=%s] http://archive.ubuntu.com/ubuntu jammy-updates main universe restricted multiverse\n' \
  "${snapshot_id}" >> /etc/apt/sources.list
printf 'deb [snapshot=%s] http://security.ubuntu.com/ubuntu jammy-security main universe restricted multiverse\n' \
  "${snapshot_id}" >> /etc/apt/sources.list
# Hosted runners ship packages newer than the snapshot. Prefer the snapshot so
# installs resolve to one consistent package set, downgrading when required.
printf 'Package: *\nPin: release o=Ubuntu\nPin-Priority: 1001\n' \
  > /etc/apt/preferences.d/ubuntu-snapshot
# Apply to every later apt-get call, including ones made by other tools.
printf 'APT::Get::allow-downgrades "true";\n' \
  > /etc/apt/apt.conf.d/99-ubuntu-snapshot-downgrades
