#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
NODE_BIN="${NODE_BIN:-node}"
TSX_IMPORT="${TSX_IMPORT:-tsx}"

cd "$REPO_ROOT"

echo "product-pipeline-validator: unit tests"
TSX_IMPORT_PATH="$TSX_IMPORT" "$NODE_BIN" --import "$TSX_IMPORT" --test tests/extension-units/product-pipeline.test.ts

echo "product-pipeline-validator: integration tests"
TSX_IMPORT_PATH="$TSX_IMPORT" "$NODE_BIN" --import "$TSX_IMPORT" --test tests/integration/product-pipeline.test.ts

echo "product-pipeline-validator: compile helper and cli"
npx tsc --noEmit --skipLibCheck --allowImportingTsExtensions --moduleResolution nodenext --module nodenext --target es2022 --lib es2022,dom --types node \
  .pi/agent/extensions/product-slice-lifecycle.ts \
  .pi/agent/extensions/product-pipeline.ts \
  scripts/harness-product-pipeline.ts \
  scripts/harness-operator.ts

echo "product-pipeline-validator: static docs, schema, and package wiring"
python3 - <<'PY'
import json
from pathlib import Path
root = Path.cwd()
package = json.loads((root / 'package.json').read_text())['scripts']
template = json.loads((root / '.pi/agent/package/templates/package.template.json').read_text())['scripts']
for scripts in (package, template):
    assert 'harness:product-pipeline' in scripts
    assert 'test:product-pipeline' in scripts
    assert 'validate:product-pipeline' in scripts
schema = json.loads((root / '.pi/agent/state/schemas/product-pipeline.schema.json').read_text())
assert schema['title'] == 'Product Pipeline Run'
phase_order = [entry['const'] for entry in schema['$defs']['phaseOrder']['prefixItems']]
assert phase_order == ['stitch_prompt', 'stitch_generation', 'screen_approval', 'slice_contract', 'fe_implementation', 'fe_validation', 'be_implementation', 'be_validation', 'quality']
for rel in [
    '.pi/agent/docs/product_pipeline_runtime.md',
    '.pi/agent/docs/operator_workflow.md',
    '.pi/agent/docs/operator_control_model.md',
    '.pi/agent/docs/team_orchestration_architecture.md',
    '.pi/agent/docs/product_planning_workflow.md',
    'README.md',
]:
    text = (root / rel).read_text(encoding='utf-8').lower()
    assert 'product pipeline' in text or 'product-pipeline' in text, rel
runtime_doc = (root / '.pi/agent/docs/product_pipeline_runtime.md').read_text(encoding='utf-8').lower()
for needle in [
    'no daemon',
    'intra-slice phases remain sequential',
    'cross-slice parallelism requires phase 10',
    'dry-run writes no files',
    'apply performs one bounded',
    'hitl gates block apply',
]:
    assert needle in runtime_doc, needle
print('product-pipeline-wiring-ok')
PY

echo "product-pipeline-validation: PASS"
