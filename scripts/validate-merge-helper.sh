#!/usr/bin/env bash
set -euo pipefail
NODE_BIN="${NODE_BIN:-node}"
PYTHON_BIN="${PYTHON_BIN:-python3}"

echo "merge-helper-validator: unit tests"
"$NODE_BIN" --import tsx --test tests/extension-units/merge-helper.test.ts

echo "merge-helper-validator: integration tests"
"$NODE_BIN" --import tsx --test tests/integration/merge-helper.test.ts

echo "merge-helper-validator: compile helper"
npx tsc --noEmit --skipLibCheck --allowImportingTsExtensions --moduleResolution nodenext --module nodenext --target es2022 --lib es2022,dom --types node \
  .pi/agent/extensions/slice-lifecycle.ts \
  scripts/harness-pr-gate.ts \
  scripts/harness-sync-main.ts \
  scripts/harness-merge.ts

echo "merge-helper-validator: policy/docs/package wiring"
"$PYTHON_BIN" - <<'PY'
import json
from pathlib import Path
root = Path.cwd()
package = json.loads((root / 'package.json').read_text())
scripts = package.get('scripts', {})
for name in ['harness:merge', 'harness:merge:json', 'test:merge-helper', 'validate:merge-helper', 'harness:pr-gate', 'harness:sync-main']:
    assert name in scripts, f'missing package script {name}'
policy = json.loads((root / '.pi/agent/release/merge-release-policy.json').read_text())
assert policy['requiredLifecycleStage'] == 'merge_ready'
assert policy['requiredPrGateState'] == 'pass'
assert policy['blockDraftPrs'] is True
assert policy['blockRequestedChanges'] is True
assert policy['blockBlockingComments'] is True
assert policy['blockLocalDirtOnApply'] is True
assert policy['allowAutoSyncMainByDefault'] is False
for path in ['README.md', '.pi/agent/docs/operator_workflow.md', '.pi/agent/docs/operator_quickstart.md', '.pi/agent/docs/operator_control_model.md', 'packages/pi-g-skills/skills/g-submit/SKILL.md']:
    text = (root / path).read_text(encoding='utf-8')
    assert 'harness:merge' in text or 'harness-merge' in text, f'{path} missing merge helper mention'
doc = (root / '.pi/agent/docs/merge_release_policy.md').read_text(encoding='utf-8')
for phrase in ['merge_ready', 'PR gate', '--sync-main', 'not deployment']:
    assert phrase in doc, f'merge policy doc missing {phrase}'
print('merge-helper-wiring-ok')
PY

echo "merge-helper-validation: PASS"
