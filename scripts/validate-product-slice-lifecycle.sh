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

echo "product-slice-lifecycle-validator: unit tests"
"$NODE_BIN" --import "$TSX_IMPORT" --test tests/extension-units/product-slice-lifecycle.test.ts

echo "product-slice-lifecycle-validator: compile helper"
WORKDIR="$TMP_ROOT/compile"
mkdir -p "$WORKDIR/src"
cp "$REPO_ROOT/.pi/agent/extensions/product-slice-lifecycle.ts" "$WORKDIR/src/"
cat > "$WORKDIR/package.json" <<'JSON'
{
  "name": "ma-code-product-slice-lifecycle-compile",
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
  npx tsc --noEmit --skipLibCheck --allowImportingTsExtensions --moduleResolution nodenext --module nodenext --target es2022 --lib es2022,dom --types node src/product-slice-lifecycle.ts
)

echo "product-slice-lifecycle-validator: schema/docs wiring"
python3 - <<'PY' "$REPO_ROOT"
import json, pathlib, sys
root = pathlib.Path(sys.argv[1])
schema = json.loads((root / ".pi/agent/state/schemas/product-slice-plan.schema.json").read_text(encoding="utf-8"))
template = json.loads((root / "docs/initiatives/TEMPLATE/slice-plan.json").read_text(encoding="utf-8"))
helper = (root / ".pi/agent/extensions/product-slice-lifecycle.ts").read_text(encoding="utf-8")
doc = (root / ".pi/agent/docs/product_slice_lifecycle.md").read_text(encoding="utf-8")
product_doc = (root / ".pi/agent/docs/product_planning_workflow.md").read_text(encoding="utf-8")
slice_doc = (root / ".pi/agent/docs/slice_lifecycle.md").read_text(encoding="utf-8")
required = [
    "stitch_prompt",
    "stitch_generation",
    "screen_approval",
    "slice_contract",
    "fe_implementation",
    "fe_validation",
    "be_implementation",
    "be_validation",
    "quality",
]
assert [entry["const"] for entry in schema["$defs"]["requiredPhaseOrder"]["prefixItems"]] == required
assert template["policy"]["requiredPhaseOrder"] == required
assert template["policy"]["intraSliceParallelism"] == "forbidden"
for needle in [
    "PRODUCT_SLICE_PHASE_ORDER",
    "decideProductSlicePhaseTransition",
    "validateProductSlicePlan",
    "loadProductSlicePlan",
    "blocked_same_slice_parallel",
    "blocked_out_of_order",
]:
    assert needle in helper, needle
for needle in [
    "planning/DAG only",
    "does not write queue state",
    "does not create tasks",
    "does not call Stitch",
    "does not dispatch",
    "fe_validation",
    "be_implementation",
]:
    assert needle in doc, needle
assert "docs/initiatives/<feature-slug>/slice-plan.json" in product_doc
assert "Product slice lifecycle is Phase 2 planning/DAG only" in product_doc
assert "intentionally separate from the product-slice planning/DAG lifecycle" in slice_doc
print("product-slice-lifecycle-wiring-ok")
PY

echo "product-slice-lifecycle-validation: PASS"
