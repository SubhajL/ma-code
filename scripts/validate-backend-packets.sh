#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
NODE_BIN="${NODE_BIN:-node}"

cd "$REPO_ROOT"

echo "backend-packet-validator: unit tests"
"$NODE_BIN" --import tsx --test tests/extension-units/backend-packet-generator.test.ts

echo "backend-packet-validator: integration tests"
"$NODE_BIN" --import tsx --test tests/integration/backend-packet-generator.test.ts

echo "backend-packet-validator: task packet/routing/domain regressions"
"$NODE_BIN" --import tsx --test tests/extension-units/orchestration-helpers.test.ts tests/extension-units/harness-routing.test.ts tests/extension-units/domain-governance.test.ts

echo "backend-packet-validator: compile helper and cli"
npx tsc --noEmit --skipLibCheck --allowImportingTsExtensions --moduleResolution nodenext --module nodenext --target es2022 --lib es2022,dom --types node \
  .pi/agent/extensions/backend-packet-generator.ts \
  .pi/agent/extensions/task-packets.ts \
  .pi/agent/extensions/harness-routing.ts \
  .pi/agent/extensions/domain-governance.ts \
  .pi/agent/extensions/team-activation.ts \
  scripts/harness-be-packet.ts

echo "backend-packet-validator: static docs, schema, and package wiring"
python3 - <<'PY'
import json
from pathlib import Path
root = Path.cwd()
package = json.loads((root / 'package.json').read_text())['scripts']
template = json.loads((root / '.pi/agent/package/templates/package.template.json').read_text())['scripts']
for scripts in (package, template):
    assert 'harness:be-packet' in scripts
    assert 'test:backend-packet' in scripts
    assert 'validate:backend-packet' in scripts
schema = json.loads((root / '.pi/agent/state/schemas/frontend-validation-evidence.schema.json').read_text())
assert schema['properties']['phase']['const'] == 'fe_validation'
assert 'passed' in schema['properties']['status']['enum']
for rel in [
    '.pi/agent/docs/backend_packet_generation.md',
    '.pi/agent/docs/product_planning_workflow.md',
    '.pi/agent/docs/team_orchestration_architecture.md',
    '.pi/agent/docs/domain_governance.md',
    '.pi/agent/prompts/roles/backend_worker.md',
    'README.md',
]:
    text = (root / rel).read_text(encoding='utf-8').lower()
    assert 'backend packet' in text or 'be packet' in text, rel
backend_doc = (root / '.pi/agent/docs/backend_packet_generation.md').read_text(encoding='utf-8').lower()
for needle in [
    'follows frontend validation',
    'preview-only',
    'no queue jobs',
    'no runtime tasks',
    'no worker sessions',
    'backend_implementation',
]:
    assert needle in backend_doc, needle
print('backend-packet-wiring-ok')
PY

echo "backend-packet-validation: PASS"
