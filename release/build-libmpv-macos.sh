#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${repository_root}/release/components.lock"

if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "arm64" ]]; then
  echo "The first macOS bundle must be built on Apple Silicon." >&2
  exit 1
fi

for tool in brew git meson ninja pkg-config otool install_name_tool; do
  command -v "${tool}" >/dev/null || { echo "Missing required tool: ${tool}" >&2; exit 1; }
done

build_root="$(mktemp -d)"
install_prefix="${build_root}/prefix"
resource_lib="${repository_root}/src-tauri/resources/lib"

git clone --filter=blob:none https://github.com/mpv-player/mpv.git "${build_root}/mpv"
git -C "${build_root}/mpv" checkout "${MPV_REF}"
test "$(git -C "${build_root}/mpv" rev-parse --short=7 HEAD)" = "${MPV_COMMIT}"

export PKG_CONFIG_PATH="$(brew --prefix ffmpeg@7)/lib/pkgconfig:$(brew --prefix libass)/lib/pkgconfig:$(brew --prefix libplacebo)/lib/pkgconfig"
meson setup "${build_root}/mpv-build" "${build_root}/mpv" \
  --prefix="${install_prefix}" --buildtype=release \
  -Dbuild-date=false -Dlibmpv=true -Dtests=false
meson compile -C "${build_root}/mpv-build"
meson install -C "${build_root}/mpv-build"

mkdir -p "${resource_lib}"
cp -L "${install_prefix}/lib/libmpv.dylib" "${resource_lib}/libmpv.dylib"
install_name_tool -id "@rpath/libmpv.dylib" "${resource_lib}/libmpv.dylib"

sources=("${install_prefix}/lib/libmpv.dylib")
targets=("${resource_lib}/libmpv.dylib")
index=0
while [[ ${index} -lt ${#targets[@]} ]]; do
  source_file="${sources[${index}]}"
  target_file="${targets[${index}]}"
  while read -r dependency; do
    case "${dependency}" in
      /System/*|/usr/lib/*) continue ;;
      @loader_path/*) dependency="$(dirname "${source_file}")/${dependency#@loader_path/}" ;;
      @rpath/*)
        candidate="$(dirname "${source_file}")/${dependency#@rpath/}"
        [[ -f "${candidate}" ]] || { echo "Could not resolve ${dependency} required by ${source_file}." >&2; exit 1; }
        dependency="${candidate}"
        ;;
    esac
    [[ -f "${dependency}" ]] || { echo "Missing dylib dependency: ${dependency}" >&2; exit 1; }
    dependency="$(cd "$(dirname "${dependency}")" && pwd)/$(basename "${dependency}")"
    bundled_name="$(basename "${dependency}")"
    bundled_path="${resource_lib}/${bundled_name}"
    install_name_tool -change "${dependency}" "@loader_path/${bundled_name}" "${target_file}"
    already_staged=false
    for staged_source in "${sources[@]}"; do
      [[ "${staged_source}" == "${dependency}" ]] && already_staged=true
    done
    if [[ "${already_staged}" == false ]]; then
      cp -L "${dependency}" "${bundled_path}"
      chmod u+w "${bundled_path}"
      install_name_tool -id "@rpath/${bundled_name}" "${bundled_path}"
      sources+=("${dependency}")
      targets+=("${bundled_path}")
    fi
  done < <(otool -L "${source_file}" | tail -n +2 | awk '{print $1}')
  index=$((index + 1))
done

for dylib in "${resource_lib}"/*.dylib; do
  otool -L "${dylib}"
done

echo "Staged libmpv and its non-system dylib closure under ${resource_lib}."
