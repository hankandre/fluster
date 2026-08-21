#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
media_lib_dir="${repository_root}/src-tauri/resources/lib"

"${repository_root}/release/build-libmpv-macos.sh"

export LIBRARY_PATH="${media_lib_dir}${LIBRARY_PATH:+:${LIBRARY_PATH}}"
export DYLD_FALLBACK_LIBRARY_PATH="${media_lib_dir}${DYLD_FALLBACK_LIBRARY_PATH:+:${DYLD_FALLBACK_LIBRARY_PATH}}"

cd "${repository_root}"
pnpm tauri build --bundles dmg
