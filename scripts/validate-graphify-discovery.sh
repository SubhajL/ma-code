#!/usr/bin/env bash
set -u -o pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DATE_STAMP="$(date +%F)"
REPORT_DIR="$REPO_ROOT/reports/validation"
DEFAULT_REPORT="$REPORT_DIR/${DATE_STAMP}_graphify-discovery-validation-script.md"
DEFAULT_SUMMARY_JSON="$REPORT_DIR/${DATE_STAMP}_graphify-discovery-validation-script.json"
NODE_BIN="${NODE_BIN:-node}"
NPM_BIN="${NPM_BIN:-npm}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
REPORT_PATH="$DEFAULT_REPORT"
SUMMARY_JSON_PATH="$DEFAULT_SUMMARY_JSON"
KEEP_TEMP=0
RUN_SMOKE=0
TMP_ROOT=""
CHECK_NAMES=()
CHECK_STATUS=()
CHECK_DETAILS=()
FAILED_CHECKS=0

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Options:
  --report <path>          Write markdown report to a custom path
  --summary-json <path>    Write JSON summary to a custom path
  --smoke                  Run one explicit installed-CLI smoke test in addition to local compile/unit/integration/prompt checks
  --keep-temp              Keep temporary validation files
  -h, --help               Show this help text

Environment overrides:
  NODE_BIN=<path>          Node executable to use (default: node)
  NPM_BIN=<path>           npm executable to use (default: npm)
  PYTHON_BIN=<path>        Python executable to use (default: python3)
  GRAPHIFY_BIN=<path>      Optional explicit graphify binary path for the smoke test and adapter
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --report)
      REPORT_PATH="$2"
      shift 2
      ;;
    --summary-json)
      SUMMARY_JSON_PATH="$2"
      shift 2
      ;;
    --smoke)
      RUN_SMOKE=1
      shift
      ;;
    --keep-temp)
      KEEP_TEMP=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

mkdir -p "$REPORT_DIR" "$(dirname "$REPORT_PATH")" "$(dirname "$SUMMARY_JSON_PATH")"
TMP_ROOT="$(mktemp -d)"
SUMMARY_TABLE_FILE="$TMP_ROOT/summary_table.md"
DETAILS_FILE="$TMP_ROOT/detail_sections.md"
: > "$SUMMARY_TABLE_FILE"
: > "$DETAILS_FILE"

cleanup() {
  local exit_code=$?
  if [[ $KEEP_TEMP -eq 0 && -n "$TMP_ROOT" && -d "$TMP_ROOT" ]]; then
    rm -rf "$TMP_ROOT"
  else
    echo "Temporary validation files kept at: $TMP_ROOT" >&2
  fi
  exit "$exit_code"
}
trap cleanup EXIT

record_result() {
  local name="$1"
  local status="$2"
  local detail="$3"
  CHECK_NAMES+=("$name")
  CHECK_STATUS+=("$status")
  CHECK_DETAILS+=("$detail")
  if [[ "$status" == "FAIL" ]]; then
    FAILED_CHECKS=$((FAILED_CHECKS + 1))
  fi
}

append_summary_row() {
  local name="$1"
  local status="$2"
  local detail="$3"
  printf '| %s | %s | %s |\n' "$name" "$status" "${detail//$'\n'/ <br> }" >> "$SUMMARY_TABLE_FILE"
}

append_check_section() {
  local name="$1"
  local status="$2"
  local command="$3"
  local evidence="$4"
  {
    printf '\n## %s\n' "$name"
    printf -- '- Status: %s\n\n' "$status"
    printf '### Command\n```bash\n%s\n```\n\n' "$command"
    printf '### Key Evidence\n%b\n' "$evidence"
  } >> "$DETAILS_FILE"
}

write_header() {
  cat > "$REPORT_PATH" <<EOF
# Automated Validation Report — Graphify Discovery

- Date: $DATE_STAMP
- Generated at: $(date '+%Y-%m-%dT%H:%M:%S%z')
- Repo root: $REPO_ROOT
- Node binary: $NODE_BIN
- npm binary: $NPM_BIN
- Python binary: $PYTHON_BIN
- Installed-CLI smoke: $( [[ $RUN_SMOKE -eq 1 ]] && echo enabled || echo skipped )
- Temporary root: $TMP_ROOT

## Summary Table

| Check | Status | Notes |
|---|---|---|
EOF
}

write_json_summary() {
  local names_file="$TMP_ROOT/summary_names.txt"
  local statuses_file="$TMP_ROOT/summary_status.txt"
  local details_file="$TMP_ROOT/summary_details.txt"
  : > "$names_file"
  : > "$statuses_file"
  : > "$details_file"

  local i
  for i in "${!CHECK_NAMES[@]}"; do
    printf '%s\n' "${CHECK_NAMES[$i]}" >> "$names_file"
    printf '%s\n' "${CHECK_STATUS[$i]}" >> "$statuses_file"
    printf '%s\n' "${CHECK_DETAILS[$i]}" >> "$details_file"
  done

  "$PYTHON_BIN" - <<'PY' "$SUMMARY_JSON_PATH" "$names_file" "$statuses_file" "$details_file" "$FAILED_CHECKS"
import json, sys
out_path, names_path, statuses_path, details_path, failed = sys.argv[1:]
with open(names_path, encoding='utf-8') as f:
    names = [line.rstrip('\n') for line in f]
with open(statuses_path, encoding='utf-8') as f:
    statuses = [line.rstrip('\n') for line in f]
with open(details_path, encoding='utf-8') as f:
    details = [line.rstrip('\n') for line in f]
checks = [{"name": n, "status": s, "detail": d} for n, s, d in zip(names, statuses, details)]
summary = {"status": "PASS" if int(failed) == 0 else "FAIL", "failedChecks": int(failed), "checks": checks}
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(summary, f, indent=2)
    f.write('\n')
PY
}

setup_temp_runtime() {
  local workdir="$TMP_ROOT/graphify-runtime"
  mkdir -p "$workdir/.pi/agent/extensions" "$workdir/tests/extension-units" "$workdir/tests/integration"

  cat > "$workdir/package.json" <<'JSON'
{
  "name": "graphify-discovery-validator-runtime",
  "private": true,
  "type": "module",
  "dependencies": {
    "tsx": "^4.20.5",
    "typescript": "^5.9.3",
    "@types/node": "^24.5.2",
    "@mariozechner/pi-coding-agent": "0.67.6",
    "@sinclair/typebox": "^0.34.41"
  }
}
JSON

  cp "$REPO_ROOT/.pi/agent/extensions/graphify-adapter.ts" "$workdir/.pi/agent/extensions/graphify-adapter.ts"
  cp "$REPO_ROOT/.pi/agent/extensions/discovery-policy.ts" "$workdir/.pi/agent/extensions/discovery-policy.ts"
  cp "$REPO_ROOT/.pi/agent/extensions/graphify-validation-decision.ts" "$workdir/.pi/agent/extensions/graphify-validation-decision.ts"
  cp "$REPO_ROOT/tests/extension-units/test-utils.ts" "$workdir/tests/extension-units/test-utils.ts"
  cp "$REPO_ROOT/tests/extension-units/graphify-adapter.test.ts" "$workdir/tests/extension-units/graphify-adapter.test.ts"
  cp "$REPO_ROOT/tests/extension-units/discovery-policy.test.ts" "$workdir/tests/extension-units/discovery-policy.test.ts"
  cp "$REPO_ROOT/tests/extension-units/graphify-validation-decision.test.ts" "$workdir/tests/extension-units/graphify-validation-decision.test.ts"
  cp "$REPO_ROOT/tests/integration/graphify-adapter.test.ts" "$workdir/tests/integration/graphify-adapter.test.ts"

  (
    cd "$workdir"
    "$NPM_BIN" install --silent >/dev/null 2>&1
  )
}

run_test_file() {
  local runtime_dir="$1"
  local test_file="$2"
  local out_file="$3"
  (
    cd "$runtime_dir"
    "$NODE_BIN" --import tsx --test "$test_file" >"$out_file" 2>&1
  )
}

check_1_compile_graphify_adapter() {
  local name="1. Graphify adapter and discovery selector compile"
  local out="$TMP_ROOT/check_1_compile_graphify_adapter.txt"
  local runtime_dir="$TMP_ROOT/graphify-runtime"
  local cmd="cd $runtime_dir && npx tsc --noEmit --skipLibCheck --allowImportingTsExtensions --moduleResolution nodenext --module nodenext --target es2022 --lib es2022,dom --types node .pi/agent/extensions/graphify-adapter.ts .pi/agent/extensions/discovery-policy.ts .pi/agent/extensions/graphify-validation-decision.ts"

  if (
    cd "$runtime_dir" &&
    npx tsc --noEmit --skipLibCheck --allowImportingTsExtensions --moduleResolution nodenext --module nodenext --target es2022 --lib es2022,dom --types node \
      .pi/agent/extensions/graphify-adapter.ts .pi/agent/extensions/discovery-policy.ts .pi/agent/extensions/graphify-validation-decision.ts >"$out" 2>&1
  ); then
    local detail="graphify-adapter.ts, discovery-policy.ts, and graphify-validation-decision.ts compile in an isolated runtime package."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  else
    local detail="Graphify adapter/discovery selector compile check failed."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  fi
}

check_2_graphify_unit_tests() {
  local name="2. Graphify adapter unit tests"
  local out="$TMP_ROOT/check_2_graphify_unit_tests.txt"
  local runtime_dir="$TMP_ROOT/graphify-runtime"
  local cmd="cd $runtime_dir && $NODE_BIN --import tsx --test tests/extension-units/graphify-adapter.test.ts"

  if run_test_file "$runtime_dir" "tests/extension-units/graphify-adapter.test.ts" "$out"; then
    local detail="Graphify adapter unit tests passed for install detection, no-auto-install behavior, managed query, freshness/cadence guidance, approval gate, forbidden flags, preflight-token enforcement, and managed output constraints."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  else
    local detail="Graphify adapter unit tests failed."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  fi
}

check_3_graphify_integration_test() {
  local name="3. Graphify adapter integration test"
  local out="$TMP_ROOT/check_3_graphify_integration_test.txt"
  local runtime_dir="$TMP_ROOT/graphify-runtime"
  local cmd="cd $runtime_dir && $NODE_BIN --import tsx --test tests/integration/graphify-adapter.test.ts"

  if run_test_file "$runtime_dir" "tests/integration/graphify-adapter.test.ts" "$out"; then
    local detail="Graphify adapter integration test passed for fake-binary execution, managed artifact output, sanitized source snapshot, metadata proof, and final-validation freshness guidance."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  else
    local detail="Graphify adapter integration test failed."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  fi
}

check_4_graphify_prompt_contracts() {
  local name="4. Graphify prompt-contract skepticism"
  local out="$TMP_ROOT/check_4_graphify_prompt_contracts.txt"
  local cmd="cd $REPO_ROOT && bash scripts/validate-prompt-contracts.sh"

  if (
    cd "$REPO_ROOT" &&
    bash scripts/validate-prompt-contracts.sh >"$out" 2>&1
  ); then
    local detail="Prompt-contract validation passed, including Graphify skepticism/routing language for targeted prompts."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  else
    local detail="Prompt-contract validation failed for Graphify skepticism/routing requirements."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  fi
}

check_5_discovery_policy_selector_unit_tests() {
  local name="5. discovery-policy selector unit tests"
  local out="$TMP_ROOT/check_5_discovery_policy_selector_unit_tests.txt"
  local runtime_dir="$TMP_ROOT/graphify-runtime"
  local cmd="cd $runtime_dir && $NODE_BIN --import tsx --test tests/extension-units/discovery-policy.test.ts"

  if run_test_file "$runtime_dir" "tests/extension-units/discovery-policy.test.ts" "$out"; then
    local detail="Discovery-policy selector unit tests passed inside the canonical Graphify validator, proving Graphify fallback choices are validated with the adapter path."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  else
    local detail="Discovery-policy selector unit tests failed or were not copied into the Graphify validator runtime."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  fi
}

check_6_graphify_validation_decision_unit_tests() {
  local name="6. Graphify validation decision unit tests"
  local out="$TMP_ROOT/check_6_graphify_validation_decision_unit_tests.txt"
  local runtime_dir="$TMP_ROOT/graphify-runtime"
  local cmd="cd $runtime_dir && $NODE_BIN --import tsx --test tests/extension-units/graphify-validation-decision.test.ts"

  if run_test_file "$runtime_dir" "tests/extension-units/graphify-validation-decision.test.ts" "$out"; then
    local detail="Graphify validation decision unit tests passed for explicit states, required missing proof blocking, optional skip, source verification, and pass behavior."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  else
    local detail="Graphify validation decision unit tests failed."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  fi
}

check_7_graphify_validator_coverage_contract() {
  local name="7. Graphify validator coverage contract"
  local out="$TMP_ROOT/check_7_graphify_validator_coverage_contract.txt"
  local cmd="cd $REPO_ROOT && $PYTHON_BIN - <<'PY' ... validate Graphify coverage contract"

  if "$PYTHON_BIN" - <<'PY' "$REPO_ROOT" >"$out" 2>&1
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
validator = (root / "scripts/validate-graphify-discovery.sh").read_text(encoding="utf-8")
adapter_unit = (root / "tests/extension-units/graphify-adapter.test.ts").read_text(encoding="utf-8")
adapter_integration = (root / "tests/integration/graphify-adapter.test.ts").read_text(encoding="utf-8")
discovery_policy_unit = (root / "tests/extension-units/discovery-policy.test.ts").read_text(encoding="utf-8")
final_validation_sources = {
    "validator_worker.md": (root / ".pi/agent/prompts/roles/validator_worker.md").read_text(encoding="utf-8"),
    "reviewer_worker.md": (root / ".pi/agent/prompts/roles/reviewer_worker.md").read_text(encoding="utf-8"),
    "graphify_final_runbook.md": (root / ".pi/agent/docs/graphify_final_runbook.md").read_text(encoding="utf-8"),
    "operator_workflow.md": (root / ".pi/agent/docs/operator_workflow.md").read_text(encoding="utf-8"),
}

checks = [
    (
        "discovery selector Graphify recommendation",
        discovery_policy_unit,
        [
            "selects Graphify for broad structure when bounded and available",
            'recommendedTool, "graphify_adapter"',
            "freshness/confidence",
        ],
    ),
    (
        "Graphify adapter purpose requirement",
        adapter_unit,
        [
            "blocks Graphify preflight and scan without a broad discovery purpose",
            "blocked_missing_purpose",
            "blocks narrow Graphify purpose values for preflight and scan",
            "blocked_invalid_purpose",
        ],
    ),
    (
        "Graphify adapter preflight token requirement",
        adapter_unit,
        [
            "blocks Graphify scan without a matching preflight token",
            "preflightToken is required",
            "preflightToken does not match",
            "preflightTokenStatus, \"matched\"",
        ],
    ),
    (
        "freshness/cadence helper",
        adapter_unit + adapter_integration,
        [
            "freshness helper recommends query and direct verification before final validation",
            "before_final_validation",
            "query_then_direct_verify",
            "freshness/cadence guidance",
        ],
    ),
    (
        "final-validation prompt language",
        "\n".join(final_validation_sources.values()),
        [
            "Graphify-backed acceptance cannot pass unless the latest relevant graph was queried or freshness/cadence was checked, and important claims were verified with direct source inspection.",
            "latest relevant graph was queried or freshness/cadence was checked",
            "important claims were verified with direct source inspection",
        ],
    ),
]

for label in [label for label, _, _ in checks]:
    assert label in validator, f"validator report detail missing coverage label: {label}"

for label, haystack, needles in checks:
    for needle in needles:
        assert needle in haystack or needle in validator, f"{label} missing coverage proof: {needle}"
    if label == "final-validation prompt language":
        for source_name, source_text in final_validation_sources.items():
            for needle in needles:
                assert needle in source_text, f"{source_name} missing final-validation prompt coverage proof: {needle}"
    print(f"PASS: {label}")
PY
  then
    local detail="Coverage contract passed for discovery selector Graphify recommendation, Graphify adapter purpose requirement, Graphify adapter preflight token requirement, freshness/cadence helper, and final-validation prompt language."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  else
    local detail="Coverage contract failed for one or more required Graphify validator coverage areas."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  fi
}

check_8_graphify_smoke() {
  local name="8. explicit installed-CLI smoke"
  if [[ $RUN_SMOKE -eq 0 ]]; then
    local detail="Installed-CLI smoke skipped by default; rerun with --smoke for one bounded real-CLI proof."
    record_result "$name" "SKIP" "$detail"
    append_summary_row "$name" "SKIP" "$detail"
    append_check_section "$name" "SKIP" "- none" "- rerun with \`--smoke\` to execute one explicit installed-CLI smoke against a tiny temp repo"
    return
  fi

  local out="$TMP_ROOT/check_6_graphify_smoke.txt"
  local runtime_dir="$TMP_ROOT/graphify-runtime"
  local cmd="cd $runtime_dir && $NODE_BIN --import tsx $TMP_ROOT/check_6_graphify_smoke.mts"

  cat > "$TMP_ROOT/check_6_graphify_smoke.mts" <<'EOF'
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';

import graphifyAdapter from './graphify-runtime/.pi/agent/extensions/graphify-adapter.ts';
import { FakePi, makeCtx } from './graphify-runtime/tests/extension-units/test-utils.ts';

const tmpRoot = process.env.GRAPHIFY_SMOKE_ROOT;
assert(tmpRoot, 'GRAPHIFY_SMOKE_ROOT is required');
const repo = join(tmpRoot, 'graphify-smoke-repo');
await mkdir(join(repo, 'src'), { recursive: true });
await mkdir(join(repo, '.pi', 'agent', 'state', 'runtime'), { recursive: true });
await writeFile(join(repo, '.gitignore'), '.pi/agent/artifacts/\n');
await writeFile(join(repo, 'README.md'), '# smoke\n');
await writeFile(join(repo, 'src', 'entry.ts'), 'export const entry = true;\n');
execFileSync('git', ['init'], { cwd: repo, stdio: 'ignore' });

if (process.env.GRAPHIFY_BIN) {
  await access(process.env.GRAPHIFY_BIN, constants.X_OK);
}

const pi = new FakePi('feat/graphify-smoke');
graphifyAdapter(pi as any);
const tool = pi.getTool('graphify_adapter');
const preflight = await tool.execute('tool-call-id', { action: 'preflight', taskId: 'smoke', sourcePath: '.', purpose: 'architecture_review', approvedLargeCorpus: true }, undefined, undefined, makeCtx(repo));
assert.equal(preflight.details.status, 'preflight_ok');
assert.equal(typeof preflight.details.preflightToken, 'string');
const result = await tool.execute('tool-call-id', { action: 'scan', taskId: 'smoke', sourcePath: '.', purpose: 'architecture_review', approvedLargeCorpus: true, preflightToken: preflight.details.preflightToken }, undefined, undefined, makeCtx(repo));
assert.equal(result.details.status, 'completed');
assert.match(result.details.outputPath, /\.pi\/agent\/artifacts\/graphify\/smoke$/);
assert.match(result.details.graphPath, /source-snapshot\/graphify-out\/graph\.json$/);
const status = execFileSync('git', ['status', '--short'], { cwd: repo, encoding: 'utf8' });
assert.equal(status.includes('graphify'), false);
console.log(JSON.stringify({ outputPath: result.details.outputPath, graphPath: result.details.graphPath, gitStatus: status.trim() }, null, 2));
EOF

  if (
    cd "$runtime_dir" &&
    GRAPHIFY_SMOKE_ROOT="$TMP_ROOT" "$NODE_BIN" --import tsx "$TMP_ROOT/check_6_graphify_smoke.mts" >"$out" 2>&1
  ); then
    local detail="Installed-CLI smoke passed: the adapter ran against a tiny temp repo and generated managed artifacts stayed excluded from source diff."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  else
    local detail="Installed-CLI smoke failed."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  fi
}

main() {
  write_header
  setup_temp_runtime
  check_1_compile_graphify_adapter
  check_2_graphify_unit_tests
  check_3_graphify_integration_test
  check_4_graphify_prompt_contracts
  check_5_discovery_policy_selector_unit_tests
  check_6_graphify_validation_decision_unit_tests
  check_7_graphify_validator_coverage_contract
  check_8_graphify_smoke

  cat "$SUMMARY_TABLE_FILE" >> "$REPORT_PATH"
  cat >> "$REPORT_PATH" <<EOF

## How to Read This Report
- Read the checks in this order:
  1. Summary Table
  2. Final Decision
  3. Detailed Results
- Default runs prove the local Graphify validation path without requiring an installed CLI.
- The installed-CLI smoke is opt-in only and should be used when one bounded real-CLI proof is needed.

## Detailed Results
EOF
  cat "$DETAILS_FILE" >> "$REPORT_PATH"
  cat >> "$REPORT_PATH" <<EOF

## Final Decision
- Overall status: $( [[ $FAILED_CHECKS -eq 0 ]] && echo PASS || echo FAIL )
- Failed checks: $FAILED_CHECKS
- Summary JSON: $SUMMARY_JSON_PATH
- Operator Next Step: $( [[ $FAILED_CHECKS -eq 0 ]] && echo "Use this command as the canonical Graphify validation path; rerun with --smoke only when explicit real-CLI proof is needed." || echo "Inspect the failing check sections, fix the smallest Graphify-specific issue, then rerun this validator." )
EOF
  write_json_summary

  if [[ $FAILED_CHECKS -gt 0 ]]; then
    echo "graphify-discovery-validation: FAIL ($FAILED_CHECKS checks failed)" >&2
    return 1
  fi

  echo "graphify-discovery-validation: PASS"
  echo "report: $REPORT_PATH"
  echo "summary: $SUMMARY_JSON_PATH"
}

main "$@"
