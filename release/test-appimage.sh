#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 path/to/Fluster.AppImage" >&2
  exit 2
fi

appimage_path="$(realpath "$1")"
test -x "${appimage_path}"
extraction_dir="$(mktemp -d)"
trap 'rm -rf "${extraction_dir}"' EXIT

cd "${extraction_dir}"
"${appimage_path}" --appimage-extract >/dev/null

application_binary="${extraction_dir}/squashfs-root/usr/bin/fluster"
test -x "${application_binary}"
find "${extraction_dir}/squashfs-root" -type f -name 'libmpv.so*' -print -quit | grep -q .
find "${extraction_dir}/squashfs-root" -type f -name 'THIRD_PARTY_NOTICES.md' -print -quit | grep -q .
find "${extraction_dir}/squashfs-root" -type d -name 'licenses' -print -quit | grep -q .

rpath="$(patchelf --print-rpath "${application_binary}")"
[[ "${rpath}" == *'$ORIGIN/../lib'* ]]
readelf -d "${application_binary}" | grep -q '(RPATH)'

resolved_libraries="$(env -u LD_LIBRARY_PATH ldd "${application_binary}")"
libmpv_resolution="$(grep 'libmpv.so' <<<"${resolved_libraries}")"
[[ "${libmpv_resolution}" == *"${extraction_dir}/squashfs-root"* ]]
if grep -q 'not found' <<<"${resolved_libraries}"; then
  echo "An AppImage library dependency could not be resolved:" >&2
  grep 'not found' <<<"${resolved_libraries}" >&2
  exit 1
fi

echo "AppImage extraction check passed with bundled libmpv."
