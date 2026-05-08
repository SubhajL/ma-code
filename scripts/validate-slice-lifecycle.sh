#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
NODE_BIN="${NODE_BIN:-node}"
TSX_IMPORT="${TSX_IMPORT:-tsx}"
TMP_ROOT="$(mktemp -d)"
cleanup() {
  if [[ -n "$TMP_ROOT" && -d "$TMP_ROOT" ]]; then
    find "$TMP_ROOT" -mindepth 1 -delete 2>/dev/null || true
    rmdir "$TMP_ROOT" 2>/dev/null || true
  fi
}
trap cleanup EXIT

cd "$REPO_ROOT"

echo "slice-lifecycle-validator: unit tests"
"$NODE_BIN" --import "$TSX_IMPORT" --test tests/extension-units/slice-lifecycle.test.ts

echo "slice-lifecycle-validator: integration tests"
"$NODE_BIN" --import "$TSX_IMPORT" --test tests/integration/slice-lifecycle.test.ts

echo "slice-lifecycle-validator: compile helper and CLI"
npx tsc --noEmit --skipLibCheck --allowImportingTsExtensions --moduleResolution nodenext --module nodenext --target es2022 --lib es2022,dom --types node \
  .pi/agent/extensions/slice-lifecycle.ts \
  scripts/harness-slice-lifecycle.ts \
  scripts/harness-merge.ts

echo "slice-lifecycle-validator: policy/docs/package wiring"
python3 - <<'PY'
import json
from pathlib import Path
root = Path.cwd()
policy = json.loads((root / '.pi/agent/lifecycle/slice-lifecycle-policy.json').read_text())
schema = json.loads((root / '.pi/agent/state/schemas/lifecycle-evidence.schema.json').read_text())
slice_helper = (root / '.pi/agent/extensions/slice-lifecycle.ts').read_text(encoding='utf-8')
slice_cli = (root / 'scripts/harness-slice-lifecycle.ts').read_text(encoding='utf-8')
merge_cli = (root / 'scripts/harness-merge.ts').read_text(encoding='utf-8')
expected = [
  'intake_required','planning_ready','task_ready','coding_red','coding_green','review_ready','checked','create_ready','created','submitted','pr_gate_clean','merge_ready','merged','local_main_synced'
]
actual = [stage['name'] for stage in policy['checkpoints']]
assert actual == expected, actual
assert schema['title'] == 'Lifecycle Evidence Bundle'
assert schema['properties']['version']['const'] == 1
assert 'directImplementationExemption' in schema['properties']
scripts = json.loads((root / 'package.json').read_text())['scripts']
for name in ['harness:slice-lifecycle', 'test:slice-lifecycle', 'validate:slice-lifecycle']:
    assert name in scripts, name
for path in ['README.md', '.pi/agent/docs/operator_workflow.md', '.pi/agent/docs/validation_architecture.md', '.pi/agent/docs/slice_lifecycle.md']:
    text = (root / path).read_text(encoding='utf-8')
    assert 'slice lifecycle' in text.lower() or 'harness:slice-lifecycle' in text, path
for needle in ['SliceLifecycleEvidenceBundle', 'evidenceFile', 'directImplementationExemption', 'lifecycleEvidencePath', 'reports/lifecycle/']:
    assert needle in slice_helper, needle
assert '--evidence-file' in slice_cli
assert '--lifecycle-evidence' in merge_cli
assert 'reports/lifecycle/<task-id>.merge-evidence.json' in (root / '.pi/agent/docs/slice_lifecycle.md').read_text(encoding='utf-8')
for path in [
    'packages/pi-g-skills/skills/g-planning/SKILL.md',
    'packages/pi-g-skills/skills/g-coding/SKILL.md',
    'packages/pi-g-skills/skills/g-check/SKILL.md',
    'packages/pi-g-skills/skills/g-create/SKILL.md',
    'packages/pi-g-skills/skills/g-submit/SKILL.md',
]:
    text = (root / path).read_text(encoding='utf-8')
    assert 'Lifecycle evidence' in text, path
print('slice-lifecycle-wiring-ok')
PY

echo "slice-lifecycle-validator: manual CLI smoke"
"$NODE_BIN" --import "$TSX_IMPORT" scripts/harness-slice-lifecycle.ts status --json >/dev/null

echo "slice-lifecycle-validation: PASS"
