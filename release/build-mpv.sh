#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
image_name="fluster-mpv-bundle:ubuntu-22.04"
container_name="fluster-mpv-export-$$"
export_dir="$(mktemp -d)"
resource_dir="${repository_root}/src-tauri/resources"

docker build --file "${repository_root}/release/Dockerfile.mpv" \
  --tag "${image_name}" "${repository_root}/release"
docker create --name "${container_name}" "${image_name}" >/dev/null
trap 'docker rm -f "${container_name}" >/dev/null 2>&1 || true; rm -rf "${export_dir}"' EXIT

docker cp "${container_name}:/bundle/." "${export_dir}/"
mkdir -p "${resource_dir}/lib" "${resource_dir}/licenses"
cp -a "${export_dir}/lib/." "${resource_dir}/lib/"
cp -a "${export_dir}/licenses/." "${resource_dir}/licenses/"
cp "${export_dir}/components.lock" "${resource_dir}/components.lock"
cp "${export_dir}/mpv-version.txt" "${resource_dir}/mpv-version.txt"
cp "${repository_root}/release/THIRD_PARTY_NOTICES.md" \
  "${resource_dir}/THIRD_PARTY_NOTICES.md"

test -f "${resource_dir}/lib/libmpv.so.2"
LD_LIBRARY_PATH="${resource_dir}/lib" ldd "${resource_dir}/lib/libmpv.so.2"
