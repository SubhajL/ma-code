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

echo "stitch-prompt-validator: unit tests"
"$NODE_BIN" --import "$TSX_IMPORT" --test tests/extension-units/stitch-prompt-generator.test.ts

echo "stitch-prompt-validator: integration tests"
"$NODE_BIN" --import "$TSX_IMPORT" --test tests/integration/stitch-prompt.test.ts

echo "stitch-prompt-validator: compile helper and CLI"
WORKDIR="$TMP_ROOT/compile"
mkdir -p "$WORKDIR/src/.pi/agent/extensions" "$WORKDIR/src/scripts"
cp "$REPO_ROOT/.pi/agent/extensions/product-slice-lifecycle.ts" "$WORKDIR/src/.pi/agent/extensions/"
cp "$REPO_ROOT/.pi/agent/extensions/stitch-prompt-generator.ts" "$WORKDIR/src/.pi/agent/extensions/"
cp "$REPO_ROOT/scripts/harness-stitch-prompt.ts" "$WORKDIR/src/scripts/"
cat > "$WORKDIR/package.json" <<'JSON'
{
  "name": "ma-code-stitch-prompt-compile",
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
    src/.pi/agent/extensions/stitch-prompt-generator.ts \
    src/scripts/harness-stitch-prompt.ts
)

echo "stitch-prompt-validator: docs/package/static wiring"
python3 - <<'PY' "$REPO_ROOT"
import json, pathlib, sys
root = pathlib.Path(sys.argv[1])
package = json.loads((root / "package.json").read_text(encoding="utf-8"))
assert package["scripts"]["harness:stitch-prompt"] == "node --import tsx scripts/harness-stitch-prompt.ts"
assert package["scripts"]["test:stitch-prompt"] == "node --import tsx --test tests/extension-units/stitch-prompt-generator.test.ts tests/integration/stitch-prompt.test.ts"
assert package["scripts"]["validate:stitch-prompt"] == "./scripts/validate-stitch-prompts.sh"
helper = (root / ".pi/agent/extensions/stitch-prompt-generator.ts").read_text(encoding="utf-8")
cli = (root / "scripts/harness-stitch-prompt.ts").read_text(encoding="utf-8")
doc = (root / ".pi/agent/docs/stitch_prompt_generation.md").read_text(encoding="utf-8")
workflow = (root / ".pi/agent/docs/product_planning_workflow.md").read_text(encoding="utf-8")
lifecycle = (root / ".pi/agent/docs/product_slice_lifecycle.md").read_text(encoding="utf-8")
static = (root / "scripts/check-repo-static.sh").read_text(encoding="utf-8")
for needle in [
    "generateStitchPrompt",
    "writeStitchPromptArtifacts",
    "REQUIRED_STITCH_PROMPT_SECTIONS",
    "human_prompt_review",
    "sourceHashes",
]:
    assert needle in helper, needle
for needle in ["--dry-run", "--apply", "--allow-non-ui", "runHarnessStitchPrompt"]:
    assert needle in cli, needle
for needle in [
    "does not call Stitch",
    "does not create task packets",
    "does not create queue jobs",
    "does not implement frontend or backend code",
    "human_prompt_review",
]:
    assert needle in doc, needle
assert "Phase 3 Stitch prompt generation" in workflow
assert "prompt-only" in workflow
assert "stitch_prompt_generation.md" in lifecycle
for path in [
    ".pi/agent/extensions/stitch-prompt-generator.ts",
    "scripts/harness-stitch-prompt.ts",
    "tests/extension-units/stitch-prompt-generator.test.ts",
    "tests/integration/stitch-prompt.test.ts",
    "scripts/validate-stitch-prompts.sh",
    ".pi/agent/docs/stitch_prompt_generation.md",
]:
    assert path in static, path
print("stitch-prompt-wiring-ok")
PY

echo "stitch-prompt-validation: PASS"
