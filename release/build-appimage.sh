#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
media_lib_dir="${repository_root}/src-tauri/resources/lib"

"${repository_root}/release/build-mpv.sh"

export LIBRARY_PATH="${media_lib_dir}${LIBRARY_PATH:+:${LIBRARY_PATH}}"
export LD_LIBRARY_PATH="${media_lib_dir}${LD_LIBRARY_PATH:+:${LD_LIBRARY_PATH}}"

cd "${repository_root}"
pnpm tauri build --bundles appimage
