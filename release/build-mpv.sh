#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
image_name="fluster-mpv-bundle:ubuntu-22.04"
container_name="fluster-mpv-export-$$"
export_dir="$(mktemp -d)"
resource_dir="${repository_root}/src-tauri/resources"
media_stage_dir="${repository_root}/src-tauri/target/fluster-media"
trap 'docker rm -f "${container_name}" >/dev/null 2>&1 || true; rm -rf "${export_dir}"' EXIT

docker_build=(docker build)
if [[ -n "${FLUSTER_DOCKER_CACHE_FROM:-}" || -n "${FLUSTER_DOCKER_CACHE_TO:-}" ]]; then
  docker_build=(docker buildx build --load)
fi

build_args=()
if [[ -n "${FLUSTER_DOCKER_CACHE_FROM:-}" ]]; then
  build_args+=(--cache-from "${FLUSTER_DOCKER_CACHE_FROM}")
fi
if [[ -n "${FLUSTER_DOCKER_CACHE_TO:-}" ]]; then
  build_args+=(--cache-to "${FLUSTER_DOCKER_CACHE_TO}")
fi

"${docker_build[@]}" "${build_args[@]}" \
  --file "${repository_root}/release/Dockerfile.mpv" \
  --tag "${image_name}" "${repository_root}/release"
docker create --name "${container_name}" "${image_name}" >/dev/null

docker cp "${container_name}:/bundle/." "${export_dir}/"
rm -rf "${media_stage_dir}" "${resource_dir}/lib" "${resource_dir}/licenses"
mkdir -p "${media_stage_dir}/lib" "${resource_dir}/licenses"
cp -a "${export_dir}/lib/." "${media_stage_dir}/lib/"
cp -a "${export_dir}/licenses/." "${resource_dir}/licenses/"
cp "${export_dir}/components.lock" "${resource_dir}/components.lock"
cp "${export_dir}/media-libraries.txt" "${resource_dir}/media-libraries.txt"
cp "${export_dir}/mpv-version.txt" "${resource_dir}/mpv-version.txt"
cp "${repository_root}/release/THIRD_PARTY_NOTICES.md" \
  "${resource_dir}/THIRD_PARTY_NOTICES.md"

test -f "${media_stage_dir}/lib/libmpv.so.2"
media_dependencies="$(LD_LIBRARY_PATH="${media_stage_dir}/lib" ldd "${media_stage_dir}/lib/libmpv.so.2")"
if grep -q 'not found' <<<"${media_dependencies}"; then
  echo "The staged libmpv closure has an unresolved dependency." >&2
  grep 'not found' <<<"${media_dependencies}" >&2
  exit 1
fi
while read -r dependency; do
  case "${dependency}" in
    "${media_stage_dir}"/lib/*|*/ld-linux*|*/libc.so.*|*/libm.so.*|*/libpthread.so.*|*/libdl.so.*|*/librt.so.*) ;;
    *) echo "The staged media closure resolved a host library: ${dependency}" >&2; exit 1 ;;
  esac
done < <(awk '/=> \// { print $3 } /^\// { print $1 }' <<<"${media_dependencies}")
