#!/usr/bin/env bash
# Runs a command with the Emscripten SDK on PATH.
#
# Order of preference:
#   1. $EMSDK, if the shell already has an SDK activated
#   2. ./third_party/emsdk, installed by scripts/setup-emsdk.sh
#
# Resolution is relative to the working directory, not to this script, so a
# project that consumes the library from node_modules can call it too.
set -euo pipefail

if [[ -z "${EMSDK:-}" ]]; then
  local_emsdk="${PWD}/third_party/emsdk"
  if [[ ! -f "${local_emsdk}/emsdk_env.sh" ]]; then
    echo "error: no Emscripten SDK found." >&2
    echo "       Run 'npm run setup', or activate your own and export EMSDK." >&2
    exit 1
  fi
  # shellcheck disable=SC1091
  source "${local_emsdk}/emsdk_env.sh" >/dev/null 2>&1
fi

exec "$@"
