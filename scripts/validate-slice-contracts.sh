#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
NODE_BIN="${NODE_BIN:-node}"
NPM_BIN="${NPM_BIN:-npm}"
TSX_IMPORT="${TSX_IMPORT:-tsx}"
TMP_ROOT="$(mktemp -d)"
cleanup() {
  python3 -c 'import shutil, sys; shutil.rmtree(sys.argv[1], ignore_errors=True)' "$TMP_ROOT"
}
trap cleanup EXIT

cd "$REPO_ROOT"

echo "slice-contract-validator: unit tests"
"$NODE_BIN" --import "$TSX_IMPORT" --test tests/extension-units/slice-contracts.test.ts

echo "slice-contract-validator: integration tests"
TSX_IMPORT_PATH="$TSX_IMPORT" "$NODE_BIN" --import "$TSX_IMPORT" --test tests/integration/slice-contracts.test.ts

echo "slice-contract-validator: compile helper and CLI"
WORKDIR="$TMP_ROOT/compile"
mkdir -p "$WORKDIR/src/.pi/agent/extensions" "$WORKDIR/src/scripts"
cp "$REPO_ROOT/.pi/agent/extensions/slice-contracts.ts" "$WORKDIR/src/.pi/agent/extensions/"
cp "$REPO_ROOT/scripts/harness-slice-contract.ts" "$WORKDIR/src/scripts/"
cat > "$WORKDIR/package.json" <<'JSON'
{
  "name": "ma-code-slice-contract-compile",
  "private": true,
  "type": "module",
  "dependencies": {
    "typescript": "^5.9.3",
    "@types/node": "^24.5.2"
  }
}
JSON
(
  cd "$WORKDIR"
  "$NPM_BIN" install --silent >/dev/null 2>&1
  npx tsc --noEmit --skipLibCheck --allowImportingTsExtensions --moduleResolution nodenext --module nodenext --target es2022 --lib es2022,dom --types node \
    src/.pi/agent/extensions/slice-contracts.ts \
    src/scripts/harness-slice-contract.ts
)

echo "slice-contract-validator: schema/docs/package/static wiring"
python3 - <<'PY' "$REPO_ROOT"
import json, pathlib, sys
root = pathlib.Path(sys.argv[1])
package = json.loads((root / "package.json").read_text(encoding="utf-8"))
template = json.loads((root / ".pi/agent/package/templates/package.template.json").read_text(encoding="utf-8"))
schema = json.loads((root / ".pi/agent/state/schemas/slice-contract.schema.json").read_text(encoding="utf-8"))
helper = (root / ".pi/agent/extensions/slice-contracts.ts").read_text(encoding="utf-8")
cli = (root / "scripts/harness-slice-contract.ts").read_text(encoding="utf-8")
doc = (root / ".pi/agent/docs/slice_contracts.md").read_text(encoding="utf-8")
workflow = (root / ".pi/agent/docs/product_planning_workflow.md").read_text(encoding="utf-8")
domain_doc = (root / ".pi/agent/docs/domain_governance.md").read_text(encoding="utf-8")
team_doc = (root / ".pi/agent/docs/team_orchestration_architecture.md").read_text(encoding="utf-8")
static = (root / "scripts/check-repo-static.sh").read_text(encoding="utf-8")
compile_script = (root / "scripts/check-foundation-extension-compile.sh").read_text(encoding="utf-8")
assert package["scripts"]["harness:slice-contract"] == "node --import tsx scripts/harness-slice-contract.ts"
assert package["scripts"]["test:slice-contract"] == "node --import tsx --test tests/extension-units/slice-contracts.test.ts tests/integration/slice-contracts.test.ts"
assert package["scripts"]["validate:slice-contract"] == "./scripts/validate-slice-contracts.sh"
assert template["scripts"]["harness:slice-contract"] == "node --import tsx scripts/harness-slice-contract.ts"
assert schema["properties"]["status"]["enum"] == ["draft", "ready_for_review", "approved", "blocked"]
assert schema["properties"]["nextAllowedPhase"]["const"] == "fe_implementation"
for key in ["sourceScreenArtifact", "uiStateContract", "apiContract", "errors", "mockPlan", "tddSeeds", "outOfScope"]:
    assert key in schema["required"], key
for needle in [
    "generateSliceContract",
    "writeSliceContractArtifacts",
    "screen artifact approval",
    "Screen artifact approval is not approved",
    "Stale screen artifact approval",
    "Auth requirements are unset",
]:
    assert needle in helper, needle
for needle in ["--dry-run", "--apply", "runHarnessSliceContract", "createdFiles"]:
    assert needle in cli, needle
for needle in [
    "writes no files",
    "writes only",
    "does not create task packets",
    "does not create queue jobs",
    "worker sessions",
    "current slice contract",
]:
    assert needle in doc, needle
for needle in [
    "Phase 6 slice contract generation",
    "harness:slice-contract",
    "does not create task packets",
    "does not create queue jobs",
    "does not write protected runtime JSON",
    "before FE implementation",
]:
    assert needle in workflow, needle
assert "contracts/<slice-id>.contract.json" in domain_doc
assert "Phase 6 slice contract path and hash" in team_doc
for path in [
    ".pi/agent/extensions/slice-contracts.ts",
    ".pi/agent/state/schemas/slice-contract.schema.json",
    ".pi/agent/docs/slice_contracts.md",
    "scripts/harness-slice-contract.ts",
    "tests/extension-units/slice-contracts.test.ts",
    "tests/integration/slice-contracts.test.ts",
    "scripts/validate-slice-contracts.sh",
]:
    assert path in static, path
assert "slice-contracts.ts" in compile_script
print("slice-contract-wiring-ok")
PY

echo "slice-contract-validation: PASS"
