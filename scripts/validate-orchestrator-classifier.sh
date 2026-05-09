#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TSX_IMPORT="${TSX_IMPORT_PATH:-${HARNESS_TSX_IMPORT:-tsx}}"

cd "$REPO_ROOT"
node --import "$TSX_IMPORT" --test tests/extension-units/orchestrator-classifier.test.ts
node --import "$TSX_IMPORT" --test tests/integration/orchestrator-classifier.test.ts
