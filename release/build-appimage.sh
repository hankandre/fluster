#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
media_lib_dir="${repository_root}/src-tauri/resources/lib"

"${repository_root}/release/build-mpv.sh"

export LIBRARY_PATH="${media_lib_dir}${LIBRARY_PATH:+:${LIBRARY_PATH}}"
export LD_LIBRARY_PATH="${media_lib_dir}${LD_LIBRARY_PATH:+:${LD_LIBRARY_PATH}}"

cd "${repository_root}"
pnpm tauri build --no-bundle --ci

application_binary="${repository_root}/src-tauri/target/release/fluster"
test -x "${application_binary}"
# The executable can resolve either the dependency copy made by the AppImage
# bundler or the staged resource copy, without relying on the host loader path.
patchelf --force-rpath \
  --set-rpath '$ORIGIN/../lib:$ORIGIN/../lib/fluster/resources/lib' \
  "${application_binary}"

pnpm tauri bundle --bundles appimage --ci
appimage_path="$(find "${repository_root}/src-tauri/target/release/bundle/appimage" -maxdepth 1 -name '*.AppImage' -print -quit)"
test -n "${appimage_path}"
"${repository_root}/release/test-appimage.sh" "${appimage_path}"
