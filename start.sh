#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js could not be found. Please install Node.js 20 or later (https://nodejs.org/) and try again." >&2
  exit 1
fi

exec node start.mjs "$@"
