#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TSX_IMPORT="${TSX_IMPORT_PATH:-${HARNESS_TSX_IMPORT:-tsx}}"

cd "$REPO_ROOT"
node --import "$TSX_IMPORT" --test tests/extension-units/orchestrator-context.test.ts
node --import "$TSX_IMPORT" --test tests/integration/orchestrator-context.test.ts
context_json="$(node --import "$TSX_IMPORT" scripts/harness-orchestrate.ts context --initiative greenfield-scaffold --goal "continue greenfield scaffold AFK issues" --json)"
CONTEXT_JSON="$context_json" python3 - <<'PY'
import json
import os
payload = json.loads(os.environ["CONTEXT_JSON"])
assert payload["repoContext"] == "existing_harness_repo", payload
assert payload["initiativeMaturity"] == "active_existing_initiative", payload
assert payload["greenfieldEligible"] is False, payload
assert "greenfield_assumption" in payload["blockedModes"], payload
assert "afk_queue" in payload["safeNextModes"], payload
PY

echo "orchestrator-context-validation: PASS"
