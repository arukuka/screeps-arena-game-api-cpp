#!/usr/bin/env bash
# Installs the project-local Emscripten SDK into third_party/emsdk.
#
# The version is pinned here so every checkout produces the same WASM.
set -euo pipefail

EMSDK_VERSION="6.0.9"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
emsdk_dir="${repo_root}/third_party/emsdk"

if [[ ! -d "${emsdk_dir}/.git" ]]; then
  git clone --depth 1 https://github.com/emscripten-core/emsdk.git "${emsdk_dir}"
fi

"${emsdk_dir}/emsdk" install "${EMSDK_VERSION}"
"${emsdk_dir}/emsdk" activate "${EMSDK_VERSION}"

echo
echo "Emscripten ${EMSDK_VERSION} ready. 'npm run build' picks it up automatically."
