#!/usr/bin/env bash
# Runs a command with the Emscripten SDK on PATH.
#
# Uses whatever emsdk the shell already has ($EMSDK), and otherwise falls back
# to the project-local one installed by scripts/setup-emsdk.sh.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -z "${EMSDK:-}" ]]; then
  local_emsdk="${repo_root}/third_party/emsdk"
  if [[ ! -f "${local_emsdk}/emsdk_env.sh" ]]; then
    echo "error: no Emscripten SDK found. Run 'npm run setup' first." >&2
    exit 1
  fi
  # shellcheck disable=SC1091
  source "${local_emsdk}/emsdk_env.sh" >/dev/null 2>&1
fi

exec "$@"
