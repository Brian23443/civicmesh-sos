#!/bin/sh
set -eu
cd "$(dirname "$0")"
mode="${1:-dev}"
if [ "$mode" = "preview" ] || [ "$mode" = "build" ]; then
  shift
else
  mode="dev"
fi
if command -v node >/dev/null 2>&1; then
  exec node node_modules/vite/bin/vite.js "$mode" "$@"
fi
runtime="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
if [ -x "$runtime" ]; then
  exec "$runtime" node_modules/vite/bin/vite.js "$mode" "$@"
fi
printf '%s\n' 'Install Node 20.19+ or 22.12+ to run this app.' >&2
exit 1
