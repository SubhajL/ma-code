#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
NODE_BIN="${NODE_BIN:-node}"

cd "$REPO_ROOT"

echo "slice-dependency-validator: unit tests"
"$NODE_BIN" --import tsx --test tests/extension-units/slice-dependency-decision.test.ts

echo "slice-dependency-validator: integration tests"
"$NODE_BIN" --import tsx --test tests/integration/slice-dependency-decision.test.ts

echo "slice-dependency-validator: compile helper and cli"
npx tsc --noEmit --skipLibCheck --allowImportingTsExtensions --moduleResolution nodenext --module nodenext --target es2022 --lib es2022,dom --types node \
  .pi/agent/extensions/slice-dependency-decision.ts \
  scripts/harness-slice-dependencies.ts

echo "slice-dependency-validator: static docs, schema, and package wiring"
python3 - <<'PY'
import json
from pathlib import Path
root = Path.cwd()
package = json.loads((root / 'package.json').read_text())['scripts']
template = json.loads((root / '.pi/agent/package/templates/package.template.json').read_text())['scripts']
for scripts in (package, template):
    assert 'harness:slice-dependencies' in scripts
    assert 'test:slice-dependencies' in scripts
    assert 'validate:slice-dependencies' in scripts
schema = json.loads((root / '.pi/agent/state/schemas/slice-dependency-decision.schema.json').read_text())
assert schema['properties']['version']['const'] == 1
assert schema['properties']['recommendedExecution']['enum'] == ['sequential', 'parallel_candidate']
for blocker in ['shared_file', 'shared_contract', 'shared_schema', 'shared_config', 'shared_test', 'same_slice', 'missing_proof', 'lease_conflict_unknown']:
    assert blocker in schema['$defs']['blocker']['properties']['type']['enum'], blocker
for rel in [
    '.pi/agent/docs/slice_dependency_decision.md',
    '.pi/agent/docs/product_planning_workflow.md',
    '.pi/agent/docs/team_orchestration_architecture.md',
    '.pi/agent/docs/domain_governance.md',
    '.pi/agent/docs/validation_architecture.md',
    'README.md',
]:
    text = (root / rel).read_text(encoding='utf-8')
    lower = text.lower()
    assert 'slice dependenc' in lower or 'cross-slice parallel' in lower, rel
slice_doc = (root / '.pi/agent/docs/slice_dependency_decision.md').read_text(encoding='utf-8').lower()
for needle in [
    'phase 10 does not dispatch work',
    'does not change queue-runner behavior',
    'does not schedule cross-slice parallel work',
    'intra-slice phases remain sequential',
    'same-slice phase parallelism is still forbidden',
]:
    assert needle in slice_doc, needle
print('slice-dependency-wiring-ok')
PY

echo "slice-dependency-validation: PASS"
