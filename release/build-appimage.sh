#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
media_lib_dir="${repository_root}/src-tauri/target/fluster-media/lib"
bundle_dir="${repository_root}/src-tauri/target/release/bundle/appimage"

"${repository_root}/release/build-mpv.sh"
rm -rf "${bundle_dir}"

export LIBRARY_PATH="${media_lib_dir}${LIBRARY_PATH:+:${LIBRARY_PATH}}"
export LD_LIBRARY_PATH="${media_lib_dir}${LD_LIBRARY_PATH:+:${LD_LIBRARY_PATH}}"

cd "${repository_root}"
pnpm tauri build --no-bundle --ci

application_binary="${repository_root}/src-tauri/target/release/fluster"
test -x "${application_binary}"
application_dependencies="$(LD_LIBRARY_PATH="${media_lib_dir}" ldd "${application_binary}")"
if grep -q 'not found' <<<"${application_dependencies}"; then
  echo "The release binary has an unresolved dependency." >&2
  grep 'not found' <<<"${application_dependencies}" >&2
  exit 1
fi
grep -F "libmpv.so" <<<"${application_dependencies}" | grep -Fq "${media_lib_dir}/"
awk -v stage="${media_lib_dir}/" '$2 == "=>" && index($3, stage) == 1 { print $1 }' \
  <<<"${application_dependencies}" \
  | sort -u > "${repository_root}/src-tauri/resources/media-libraries.txt"
test -s "${repository_root}/src-tauri/resources/media-libraries.txt"
# The AppImage bundler copies the staged dependency closure into usr/lib.
patchelf --force-rpath \
  --set-rpath '$ORIGIN/../lib' \
  "${application_binary}"

pnpm tauri bundle --bundles appimage --ci
mapfile -t appimages < <(find "${bundle_dir}" -maxdepth 1 -name '*.AppImage' -print)
if [[ ${#appimages[@]} -ne 1 ]]; then
  echo "Expected one AppImage, found ${#appimages[@]}." >&2
  exit 1
fi
appimage_path="${appimages[0]}"
"${repository_root}/release/test-appimage.sh" "${appimage_path}"
