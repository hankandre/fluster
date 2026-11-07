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
mapfile -t libmpv_directories < <(
  find "${extraction_dir}/squashfs-root" \( -type f -o -type l \) -name 'libmpv.so*' \
    -printf '%h\n' | sort -u
)
if [[ ${#libmpv_directories[@]} -ne 1 ]]; then
  echo "Expected one bundled libmpv directory, found ${#libmpv_directories[@]}." >&2
  printf '%s\n' "${libmpv_directories[@]}" >&2
  exit 1
fi
if [[ "${libmpv_directories[0]}" != "${extraction_dir}/squashfs-root/usr/lib" ]]; then
  echo "libmpv was bundled outside the AppImage library directory:" >&2
  echo "${libmpv_directories[0]}" >&2
  exit 1
fi
if find "${extraction_dir}/squashfs-root" -path '*/resources/lib/libmpv.so*' -print -quit | grep -q .; then
  echo "Found a duplicate resource copy of libmpv." >&2
  exit 1
fi
find "${extraction_dir}/squashfs-root" -type f -name 'THIRD_PARTY_NOTICES.md' -print -quit | grep -q .
find "${extraction_dir}/squashfs-root" -type d -name 'licenses' -print -quit | grep -q .
find "${extraction_dir}/squashfs-root" -type f -name 'components.lock' -print -quit | grep -q .
find "${extraction_dir}/squashfs-root" -type f -name 'mpv-version.txt' -print -quit | grep -q .
media_manifest="$(find "${extraction_dir}/squashfs-root" -type f -name 'media-libraries.txt' -print -quit)"
test -n "${media_manifest}"

while read -r library_name; do
  [[ -n "${library_name}" && "${library_name}" != */* ]]
  mapfile -t library_paths < <(
    find "${extraction_dir}/squashfs-root" \( -type f -o -type l \) -name "${library_name}" -print
  )
  if [[ ${#library_paths[@]} -ne 1 || "${library_paths[0]}" != "${extraction_dir}/squashfs-root/usr/lib/${library_name}" ]]; then
    echo "Expected exactly one usr/lib copy of ${library_name}." >&2
    printf '%s\n' "${library_paths[@]}" >&2
    exit 1
  fi
  library_rpath="$(patchelf --print-rpath "${library_paths[0]}")"
  [[ "${library_rpath}" == *'$ORIGIN'* ]]
done < "${media_manifest}"

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

compressed_size="$(du -h "${appimage_path}" | awk '{print $1}')"
extracted_size="$(du -sh "${extraction_dir}/squashfs-root" | awk '{print $1}')"
echo "AppImage extraction check passed with one bundled media closure."
echo "Compressed size: ${compressed_size}; extracted size: ${extracted_size}."
