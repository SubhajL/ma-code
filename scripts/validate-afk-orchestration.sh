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

echo "[afk-orchestration] unit + integration tests"
node --import "$TSX_IMPORT_PATH" --test \
  tests/extension-units/afk-orchestration.test.ts \
  tests/integration/afk-orchestration.test.ts

echo "[afk-orchestration] queue-runner compatibility"
node --import "$TSX_IMPORT_PATH" --test tests/extension-units/queue-runner.test.ts

echo "[afk-orchestration] static whitespace"
git diff --check
