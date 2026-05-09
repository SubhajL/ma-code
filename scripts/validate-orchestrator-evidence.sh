#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TSX_IMPORT="${TSX_IMPORT_PATH:-${HARNESS_TSX_IMPORT:-tsx}}"

cd "$REPO_ROOT"
node --import "$TSX_IMPORT" --test tests/extension-units/orchestrator-evidence.test.ts
node --import "$TSX_IMPORT" --test tests/integration/orchestrator-evidence.test.ts

python3 - <<'PY'
import json
from pathlib import Path
root = Path.cwd()
schema = json.loads((root / '.pi/agent/state/schemas/orchestrator-evidence.schema.json').read_text())
assert schema['properties']['merge']['properties']['rawGitMergeUsed']['const'] is False
assert 'evidence' in (root / 'scripts/harness-orchestrate.ts').read_text()
assert 'merge-check' in (root / 'scripts/harness-orchestrate.ts').read_text()
assert 'merge-apply' in (root / 'scripts/harness-orchestrate.ts').read_text()
assert 'harness:merge' in (root / '.pi/agent/extensions/orchestrator-evidence.ts').read_text()
assert 'git merge' not in (root / '.pi/agent/extensions/orchestrator-evidence.ts').read_text().replace('raw git merge is forbidden', '')
print('orchestrator-evidence-wiring-ok')
PY

echo "orchestrator-evidence-validation: PASS"
