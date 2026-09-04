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

# Resolve symlinks so BASH_SOURCE points to this script in the library,
# even when invoked via npm's node_modules/.bin/arena-emsdk-setup symlink.
if command -v realpath >/dev/null 2>&1; then
  source_path="$(realpath "${BASH_SOURCE[0]}")"
else
  source_path="${BASH_SOURCE[0]}"
  while [[ -L "${source_path}" ]]; do
    link_target="$(readlink "${source_path}")"
    if [[ "${link_target}" == /* ]]; then
      source_path="${link_target}"
    else
      source_path="$(dirname "${source_path}")/${link_target}"
    fi
  done
fi

library_root="$(cd "$(dirname "${source_path}")/.." && pwd)"

# Fallback: if .emscripten-version is not at library_root, search standard locations
if [[ ! -f "${library_root}/.emscripten-version" ]]; then
  if [[ -f "${PWD}/node_modules/screeps-arena-game-api-cpp/.emscripten-version" ]]; then
    library_root="${PWD}/node_modules/screeps-arena-game-api-cpp"
  elif [[ -f "${PWD}/.emscripten-version" ]]; then
    library_root="${PWD}"
  else
    echo "error: cannot find .emscripten-version in ${library_root}" >&2
    exit 1
  fi
fi

emsdk_version="$(cat "${library_root}/.emscripten-version")"

if [[ "${1:-}" == "--version" || "${1:-}" == "-v" ]]; then
  echo "${emsdk_version}"
  exit 0
fi

emsdk_dir="${PWD}/third_party/emsdk"

if [[ ! -d "${emsdk_dir}/.git" ]]; then
  git clone --depth 1 https://github.com/emscripten-core/emsdk.git "${emsdk_dir}"
fi

"${emsdk_dir}/emsdk" install "${emsdk_version}"
"${emsdk_dir}/emsdk" activate "${emsdk_version}"

echo
echo "Emscripten ${emsdk_version} ready. 'npm run build' picks it up automatically."
