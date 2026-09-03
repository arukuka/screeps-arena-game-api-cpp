#!/usr/bin/env bash
# Installs the Emscripten SDK into ./third_party/emsdk.
#
# The version comes from .emscripten-version next to this script, so the build,
# the setup and CI can never pin different ones. If you already have an SDK
# activated ($EMSDK), you do not need this at all.
#
# The version is read from the library; the install location is the working
# directory, so a project consuming this from node_modules gets its own SDK.
set -euo pipefail

library_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
emsdk_version="$(cat "${library_root}/.emscripten-version")"
emsdk_dir="${PWD}/third_party/emsdk"

if [[ ! -d "${emsdk_dir}/.git" ]]; then
  git clone --depth 1 https://github.com/emscripten-core/emsdk.git "${emsdk_dir}"
fi

"${emsdk_dir}/emsdk" install "${emsdk_version}"
"${emsdk_dir}/emsdk" activate "${emsdk_version}"

echo
echo "Emscripten ${emsdk_version} ready. 'npm run build' picks it up automatically."
