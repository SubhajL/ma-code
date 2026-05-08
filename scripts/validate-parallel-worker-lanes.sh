#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
NODE_BIN="${NODE_BIN:-node}"
TSX_IMPORT="${TSX_IMPORT_PATH:-tsx}"

cd "$REPO_ROOT"

"$NODE_BIN" --import "$TSX_IMPORT" --test tests/extension-units/parallel-worker-lanes.test.ts
"$NODE_BIN" --import "$TSX_IMPORT" --test tests/integration/parallel-worker-lanes.test.ts
./scripts/check-foundation-extension-compile.sh
./scripts/check-repo-static.sh
git diff --check

echo "parallel-worker-lanes-validation-ok"
