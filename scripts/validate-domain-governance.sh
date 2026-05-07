#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
NODE_BIN="${NODE_BIN:-node}"

cd "$REPO_ROOT"

echo "domain-governance-validator: unit tests"
"$NODE_BIN" --import tsx --test tests/extension-units/domain-governance.test.ts

echo "domain-governance-validator: integration tests"
"$NODE_BIN" --import tsx --test tests/integration/domain-governance.test.ts

echo "domain-governance-validator: packet regression tests"
"$NODE_BIN" --import tsx --test tests/extension-units/orchestration-helpers.test.ts

echo "domain-governance-validator: init-feature regression tests"
"$NODE_BIN" --import tsx --test tests/integration/harness-init-feature.test.ts

echo "domain-governance-validator: compile helper, packets, activation, and bootstrap"
npx tsc --noEmit --skipLibCheck --allowImportingTsExtensions --moduleResolution nodenext --module nodenext --target es2022 --lib es2022,dom --types node \
  .pi/agent/extensions/domain-governance.ts \
  .pi/agent/extensions/task-packets.ts \
  .pi/agent/extensions/team-activation.ts \
  scripts/harness-init-feature.ts

echo "domain-governance-validator: policy/docs/templates/package wiring"
python3 - <<'PY'
import json
from pathlib import Path
root = Path.cwd()
policy = json.loads((root / '.pi/agent/governance/domain-governance-policy.json').read_text())
assert policy['domainRoleDefaults']['frontend'] == 'frontend_worker'
assert policy['domainRoleDefaults']['backend'] == 'backend_worker'
assert policy['domainRoleDefaults']['infra'] == 'infra_worker'
assert policy['pathOwnershipMode'] == 'advisory_first'
package = json.loads((root / 'package.json').read_text())['scripts']
template_package = json.loads((root / '.pi/agent/package/templates/package.template.json').read_text())['scripts']
for scripts in (package, template_package):
    assert 'test:domain-governance' in scripts
    assert 'validate:domain-governance' in scripts
manifest = json.loads((root / '.pi/agent/package/harness-package.json').read_text())
assert '.pi/agent/governance' in manifest['reusableAssets']
for path in [
    '.pi/agent/docs/domain_governance.md',
    '.pi/agent/skills/frontend-safety/SKILL.md',
    '.pi/agent/package/templates/docs/frontend/README.template.md',
    '.pi/agent/package/templates/docs/backend/README.template.md',
    '.pi/agent/docs/operator_role_guide.md',
    '.pi/agent/docs/worktree_isolation_policy.md',
    '.pi/agent/docs/product_planning_workflow.md',
    'README.md',
]:
    text = (root / path).read_text(encoding='utf-8').lower()
    assert 'domain' in text or 'frontend' in text or 'backend' in text, path
print('domain-governance-wiring-ok')
PY

echo "domain-governance-validation: PASS"
