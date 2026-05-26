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

echo "stitch-artifact-validator: unit tests"
"$NODE_BIN" --import "$TSX_IMPORT" --test tests/extension-units/stitch-artifact-adapter.test.ts

echo "stitch-artifact-validator: integration tests"
"$NODE_BIN" --import "$TSX_IMPORT" --test tests/integration/stitch-artifact.test.ts

echo "stitch-artifact-validator: compile helper and CLI"
WORKDIR="$TMP_ROOT/compile"
mkdir -p "$WORKDIR/src/.pi/agent/extensions" "$WORKDIR/src/scripts"
cp "$REPO_ROOT/.pi/agent/extensions/product-slice-lifecycle.ts" "$WORKDIR/src/.pi/agent/extensions/"
cp "$REPO_ROOT/.pi/agent/extensions/stitch.ts" "$WORKDIR/src/.pi/agent/extensions/"
cp "$REPO_ROOT/.pi/agent/extensions/stitch-prompt-generator.ts" "$WORKDIR/src/.pi/agent/extensions/"
cp "$REPO_ROOT/.pi/agent/extensions/stitch-artifact-adapter.ts" "$WORKDIR/src/.pi/agent/extensions/"
cp "$REPO_ROOT/.pi/agent/extensions/live-stitch-adapter.ts" "$WORKDIR/src/.pi/agent/extensions/"
cp "$REPO_ROOT/scripts/harness-stitch-artifact.ts" "$WORKDIR/src/scripts/"
cat > "$WORKDIR/package.json" <<'JSON'
{
  "name": "ma-code-stitch-artifact-compile",
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
    src/.pi/agent/extensions/product-slice-lifecycle.ts \
    src/.pi/agent/extensions/stitch.ts \
    src/scripts/harness-stitch-artifact.ts
)

echo "stitch-artifact-validator: schema/docs/package/static wiring"
python3 - <<'PY' "$REPO_ROOT"
import json, pathlib, sys
root = pathlib.Path(sys.argv[1])
package = json.loads((root / "package.json").read_text(encoding="utf-8"))
template = json.loads((root / ".pi/agent/package/templates/package.template.json").read_text(encoding="utf-8"))
schema = json.loads((root / ".pi/agent/state/schemas/stitch-screen-artifact.schema.json").read_text(encoding="utf-8"))
helper = (root / ".pi/agent/extensions/stitch-artifact-adapter.ts").read_text(encoding="utf-8")
cli = (root / "scripts/harness-stitch-artifact.ts").read_text(encoding="utf-8")
doc = (root / ".pi/agent/docs/stitch_artifacts.md").read_text(encoding="utf-8")
workflow = (root / ".pi/agent/docs/product_planning_workflow.md").read_text(encoding="utf-8")
prompt_doc = (root / ".pi/agent/docs/stitch_prompt_generation.md").read_text(encoding="utf-8")
static = (root / "scripts/check-repo-static.sh").read_text(encoding="utf-8")
assert package["scripts"]["harness:stitch-artifact"] == "node --import tsx scripts/harness-stitch-artifact.ts"
assert package["scripts"]["test:stitch-artifact"] == "node --import tsx --test tests/extension-units/stitch-artifact-adapter.test.ts tests/integration/stitch-artifact.test.ts"
assert package["scripts"]["validate:stitch-artifact"] == "./scripts/validate-stitch-artifacts.sh"
assert template["scripts"]["harness:stitch-artifact"] == "node --import tsx scripts/harness-stitch-artifact.ts"
assert schema["properties"]["mode"]["const"] == "mock"
assert schema["properties"]["constraints"]["properties"]["liveStitchCalled"]["const"] is False
for needle in [
    "generateMockStitchArtifact",
    "writeMockStitchArtifactArtifacts",
    "sourceHashes",
    "promptHash",
    "human_artifact_review",
    "liveStitchCalled: false",
]:
    assert needle in helper, needle
for needle in ["--dry-run", "--apply", "runHarnessStitchArtifact"]:
    assert needle in cli, needle
assert "--ignore-hash" not in cli
for needle in [
    "mock-only",
    "prompt hash",
    "does not call Stitch",
    "does not create task packets",
    "does not create queue jobs",
    "screen_approval",
    "human_artifact_review",
]:
    assert needle in doc, needle
assert "Phase 4 mock Stitch artifact generation" in workflow
assert "harness:stitch-artifact" in workflow
assert "stitch_artifacts.md" in prompt_doc
for path in [
    ".pi/agent/extensions/stitch-artifact-adapter.ts",
    ".pi/agent/state/schemas/stitch-screen-artifact.schema.json",
    ".pi/agent/docs/stitch_artifacts.md",
    "scripts/harness-stitch-artifact.ts",
    "tests/extension-units/stitch-artifact-adapter.test.ts",
    "tests/integration/stitch-artifact.test.ts",
    "scripts/validate-stitch-artifacts.sh",
]:
    assert path in static, path
print("stitch-artifact-wiring-ok")
PY

echo "stitch-artifact-validation: PASS"
