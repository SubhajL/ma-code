#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
NODE_BIN="${NODE_BIN:-node}"
NPM_BIN="${NPM_BIN:-npm}"
TSX_IMPORT="${TSX_IMPORT:-tsx}"
TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

cd "$REPO_ROOT"

echo "screen-artifact-approval-validator: unit tests"
"$NODE_BIN" --import "$TSX_IMPORT" --test tests/extension-units/screen-artifact-approval.test.ts

echo "screen-artifact-approval-validator: integration tests"
"$NODE_BIN" --import "$TSX_IMPORT" --test tests/integration/screen-artifact-approval.test.ts

echo "screen-artifact-approval-validator: compile helper and CLI"
WORKDIR="$TMP_ROOT/compile"
mkdir -p "$WORKDIR/src/.pi/agent/extensions" "$WORKDIR/src/scripts"
cp "$REPO_ROOT/.pi/agent/extensions/screen-artifact-approval.ts" "$WORKDIR/src/.pi/agent/extensions/"
cp "$REPO_ROOT/scripts/harness-screen-approval.ts" "$WORKDIR/src/scripts/"
cat > "$WORKDIR/package.json" <<'JSON'
{
  "name": "ma-code-screen-artifact-approval-compile",
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
    src/.pi/agent/extensions/screen-artifact-approval.ts \
    src/scripts/harness-screen-approval.ts
)

echo "screen-artifact-approval-validator: schema/docs/package/static wiring"
python3 - <<'PY' "$REPO_ROOT"
import json, pathlib, sys
root = pathlib.Path(sys.argv[1])
package = json.loads((root / "package.json").read_text(encoding="utf-8"))
template = json.loads((root / ".pi/agent/package/templates/package.template.json").read_text(encoding="utf-8"))
schema = json.loads((root / ".pi/agent/state/schemas/screen-artifact-approval.schema.json").read_text(encoding="utf-8"))
helper = (root / ".pi/agent/extensions/screen-artifact-approval.ts").read_text(encoding="utf-8")
cli = (root / "scripts/harness-screen-approval.ts").read_text(encoding="utf-8")
doc = (root / ".pi/agent/docs/screen_artifact_approval.md").read_text(encoding="utf-8")
workflow = (root / ".pi/agent/docs/product_planning_workflow.md").read_text(encoding="utf-8")
stitch_doc = (root / ".pi/agent/docs/stitch_artifacts.md").read_text(encoding="utf-8")
static = (root / "scripts/check-repo-static.sh").read_text(encoding="utf-8")
compile_script = (root / "scripts/check-foundation-extension-compile.sh").read_text(encoding="utf-8")
assert package["scripts"]["harness:screen-approval"] == "node --import tsx scripts/harness-screen-approval.ts"
assert package["scripts"]["test:screen-approval"] == "node --import tsx --test tests/extension-units/screen-artifact-approval.test.ts tests/integration/screen-artifact-approval.test.ts"
assert package["scripts"]["validate:screen-approval"] == "./scripts/validate-screen-artifact-approval.sh"
assert template["scripts"]["harness:screen-approval"] == "node --import tsx scripts/harness-screen-approval.ts"
assert schema["properties"]["decision"]["enum"] == ["pending", "approved", "rejected"]
assert schema["properties"]["requiredBefore"]["const"] == "fe_implementation"
assert "artifactHash" in schema["required"]
for needle in [
    "getScreenArtifactApprovalStatus",
    "approveScreenArtifact",
    "rejectScreenArtifact",
    "Stale screen artifact approval",
    "Re-approval after rejection requires explicit --reapprove",
    "constraints must prove no live Stitch, task packets, or queue jobs were created",
]:
    assert needle in helper, needle
for needle in ["status", "approve", "reject", "--reapprove", "runHarnessScreenApproval"]:
    assert needle in cli, needle
for needle in [
    "approval-only",
    "writes only `docs/initiatives/<slug>/screen-artifacts/<slice-id>.approval.json`",
    "does not create task packets",
    "does not create queue jobs",
    "does not write `.pi/agent/state/runtime/*.json`",
    "decision` is `approved`",
    "artifactHash` matches the current mock screen artifact hash",
]:
    assert needle in doc, needle
for needle in [
    "Phase 5 screen artifact approval",
    "harness:screen-approval",
    "does not create task packets",
    "does not create queue jobs",
    "does not write protected runtime JSON",
]:
    assert needle in workflow, needle
assert "harness:screen-approval" in stitch_doc
for path in [
    ".pi/agent/extensions/screen-artifact-approval.ts",
    ".pi/agent/state/schemas/screen-artifact-approval.schema.json",
    ".pi/agent/docs/screen_artifact_approval.md",
    "scripts/harness-screen-approval.ts",
    "tests/extension-units/screen-artifact-approval.test.ts",
    "tests/integration/screen-artifact-approval.test.ts",
    "scripts/validate-screen-artifact-approval.sh",
]:
    assert path in static, path
assert "screen-artifact-approval.ts" in compile_script
print("screen-artifact-approval-wiring-ok")
PY

echo "screen-artifact-approval-validation: PASS"
