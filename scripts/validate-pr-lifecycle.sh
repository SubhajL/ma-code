#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -n "${TSX_IMPORT_PATH:-}" ]]; then
  TSX_IMPORT_PATH="$TSX_IMPORT_PATH"
elif [[ -f "$ROOT/node_modules/tsx/dist/loader.mjs" ]]; then
  TSX_IMPORT_PATH="$ROOT/node_modules/tsx/dist/loader.mjs"
else
  TSX_IMPORT_PATH="tsx"
fi
export TSX_IMPORT_PATH

echo "[pr-lifecycle] unit + integration tests"
node --import "$TSX_IMPORT_PATH" --test \
  tests/extension-units/pr-lifecycle.test.ts \
  tests/integration/pr-lifecycle.test.ts

echo "[pr-lifecycle] related helper compatibility"
node --import "$TSX_IMPORT_PATH" --test \
  tests/integration/pr-gate.test.ts \
  tests/integration/merge-helper.test.ts \
  tests/integration/sync-main.test.ts

echo "[pr-lifecycle] static whitespace"
git diff --check
