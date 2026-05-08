#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
NODE_BIN="${NODE_BIN:-node}"

cd "$REPO_ROOT"

echo "frontend-packet-validator: unit tests"
"$NODE_BIN" --import tsx --test tests/extension-units/frontend-packet-generator.test.ts

echo "frontend-packet-validator: integration tests"
"$NODE_BIN" --import tsx --test tests/integration/frontend-packet-generator.test.ts

echo "frontend-packet-validator: task packet/routing/domain regressions"
"$NODE_BIN" --import tsx --test tests/extension-units/orchestration-helpers.test.ts tests/extension-units/harness-routing.test.ts tests/extension-units/domain-governance.test.ts

echo "frontend-packet-validator: compile helper and cli"
npx tsc --noEmit --skipLibCheck --allowImportingTsExtensions --moduleResolution nodenext --module nodenext --target es2022 --lib es2022,dom --types node \
  .pi/agent/extensions/frontend-packet-generator.ts \
  .pi/agent/extensions/task-packets.ts \
  .pi/agent/extensions/harness-routing.ts \
  .pi/agent/extensions/domain-governance.ts \
  .pi/agent/extensions/team-activation.ts \
  scripts/harness-fe-packet.ts

echo "frontend-packet-validator: static docs and package wiring"
python3 - <<'PY'
import json
from pathlib import Path
root = Path.cwd()
package = json.loads((root / 'package.json').read_text())['scripts']
template = json.loads((root / '.pi/agent/package/templates/package.template.json').read_text())['scripts']
for scripts in (package, template):
    assert 'harness:fe-packet' in scripts
    assert 'test:frontend-packet' in scripts
    assert 'validate:frontend-packet' in scripts
for rel in [
    '.pi/agent/docs/frontend_packet_generation.md',
    '.pi/agent/docs/product_planning_workflow.md',
    '.pi/agent/docs/team_orchestration_architecture.md',
    '.pi/agent/docs/domain_governance.md',
    '.pi/agent/prompts/roles/frontend_worker.md',
    'README.md',
]:
    text = (root / rel).read_text(encoding='utf-8').lower()
    assert 'frontend packet' in text or 'fe packet' in text, rel
frontend_doc = (root / '.pi/agent/docs/frontend_packet_generation.md').read_text(encoding='utf-8').lower()
for needle in [
    'preview-only',
    'no queue jobs',
    'no runtime tasks',
    'backend packets wait for a later phase',
    'frontend_implementation',
]:
    assert needle in frontend_doc, needle
print('frontend-packet-wiring-ok')
PY

echo "frontend-packet-validation: PASS"
