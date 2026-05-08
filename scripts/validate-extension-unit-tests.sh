#!/usr/bin/env bash
set -u -o pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DATE_STAMP="$(date +%F)"
REPORT_DIR="$REPO_ROOT/reports/validation"
DEFAULT_REPORT="$REPORT_DIR/${DATE_STAMP}_extension-unit-tests-validation-script.md"
DEFAULT_SUMMARY_JSON="$REPORT_DIR/${DATE_STAMP}_extension-unit-tests-validation-script.json"
NODE_BIN="${NODE_BIN:-node}"
NPM_BIN="${NPM_BIN:-npm}"
REPORT_PATH="$DEFAULT_REPORT"
SUMMARY_JSON_PATH="$DEFAULT_SUMMARY_JSON"
KEEP_TEMP=0
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
  --keep-temp              Keep temporary validation files
  -h, --help               Show this help text

Environment overrides:
  NODE_BIN=<path>          Node executable to use (default: node)
  NPM_BIN=<path>           npm executable to use (default: npm)
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
# Automated Validation Report — Extension Unit Tests

- Date: $DATE_STAMP
- Generated at: $(date '+%Y-%m-%dT%H:%M:%S%z')
- Repo root: $REPO_ROOT
- Node binary: $NODE_BIN
- npm binary: $NPM_BIN
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

  python3 - <<'PY' "$SUMMARY_JSON_PATH" "$names_file" "$statuses_file" "$details_file" "$FAILED_CHECKS"
import json, sys
out_path, names_path, statuses_path, details_path, failed = sys.argv[1:]
with open(names_path, encoding="utf-8") as f:
    names = [line.rstrip("\n") for line in f]
with open(statuses_path, encoding="utf-8") as f:
    statuses = [line.rstrip("\n") for line in f]
with open(details_path, encoding="utf-8") as f:
    details = [line.rstrip("\n") for line in f]
checks = [
    {"name": n, "status": s, "detail": d}
    for n, s, d in zip(names, statuses, details)
]
summary = {
    "status": "PASS" if int(failed) == 0 else "FAIL",
    "failedChecks": int(failed),
    "checks": checks,
}
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(summary, f, indent=2)
    f.write("\n")
PY
}

setup_temp_runtime() {
  local workdir="$TMP_ROOT/unit-runtime"
  mkdir -p \
    "$workdir/.pi/agent/extensions" \
    "$workdir/.pi/agent/teams" \
    "$workdir/.pi/agent/packets" \
    "$workdir/.pi/agent/handoffs" \
    "$workdir/.pi/agent/validation" \
    "$workdir/.pi/agent/recovery" \
    "$workdir/.pi/agent/state/schemas" \
    "$workdir/tests/extension-units"

  cat > "$workdir/package.json" <<'JSON'
{
  "name": "ma-harness-extension-unit-tests",
  "private": true,
  "type": "module",
  "dependencies": {
    "tsx": "^4.20.5",
    "typescript": "^5.9.3",
    "@types/node": "^24.5.2",
    "@mariozechner/pi-coding-agent": "0.67.6",
    "@mariozechner/pi-ai": "0.67.6",
    "@sinclair/typebox": "^0.34.41"
  }
}
JSON

  cp "$REPO_ROOT/.pi/agent/extensions/"{safe-bash,till-done,harness-routing,team-activation,domain-governance,task-packets,handoffs,recovery-policy,recovery-runtime,queue-runner,graphify-adapter}.ts "$workdir/.pi/agent/extensions/"
  cp "$REPO_ROOT/.pi/agent/extensions/discovery-policy.ts" "$workdir/.pi/agent/extensions/"
  cp "$REPO_ROOT/.pi/agent/extensions/graphify-validation-decision.ts" "$workdir/.pi/agent/extensions/"
  cp "$REPO_ROOT/.pi/agent/extensions/graphify-orchestration-decision.ts" "$workdir/.pi/agent/extensions/"
  cp "$REPO_ROOT/.pi/agent/extensions/graphify-orchestrator.ts" "$workdir/.pi/agent/extensions/"
  cp "$REPO_ROOT/.pi/agent/extensions/execution-leases.ts" "$workdir/.pi/agent/extensions/"
  cp "$REPO_ROOT/.pi/agent/extensions/product-slice-lifecycle.ts" "$workdir/.pi/agent/extensions/"
  cp "$REPO_ROOT/.pi/agent/models.json" "$workdir/.pi/agent/models.json"
  cp "$REPO_ROOT/.pi/agent/teams/activation-policy.json" "$workdir/.pi/agent/teams/activation-policy.json"
  cp "$REPO_ROOT/.pi/agent/teams/"*.yaml "$workdir/.pi/agent/teams/"
  cp "$REPO_ROOT/.pi/agent/packets/packet-policy.json" "$workdir/.pi/agent/packets/packet-policy.json"
  cp "$REPO_ROOT/.pi/agent/handoffs/handoff-policy.json" "$workdir/.pi/agent/handoffs/handoff-policy.json"
  cp "$REPO_ROOT/.pi/agent/validation/completion-gate-policy.json" "$workdir/.pi/agent/validation/completion-gate-policy.json"
  cp "$REPO_ROOT/.pi/agent/recovery/recovery-policy.json" "$workdir/.pi/agent/recovery/recovery-policy.json"
  cp "$REPO_ROOT/.pi/agent/state/schemas/product-slice-plan.schema.json" "$workdir/.pi/agent/state/schemas/product-slice-plan.schema.json"
  cp "$REPO_ROOT/tests/extension-units/"*.ts "$workdir/tests/extension-units/"

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

check_1_safe_bash_unit_tests() {
  local name="1. safe-bash runtime guard unit tests"
  local out="$TMP_ROOT/check_1_safe_bash_unit_tests.txt"
  local runtime_dir="$TMP_ROOT/unit-runtime"
  local cmd="cd $runtime_dir && $NODE_BIN --import tsx --test tests/extension-units/safe-bash.test.ts"

  if run_test_file "$runtime_dir" "tests/extension-units/safe-bash.test.ts" "$out"; then
    local detail="safe-bash protected-path, hard-block, warn-level, and allow-path unit tests passed."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  else
    local detail="safe-bash unit tests failed."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  fi
}

check_2_till_done_unit_tests() {
  local name="2. till-done task-discipline unit tests"
  local out="$TMP_ROOT/check_2_till_done_unit_tests.txt"
  local runtime_dir="$TMP_ROOT/unit-runtime"
  local cmd="cd $runtime_dir && $NODE_BIN --import tsx --test tests/extension-units/till-done.test.ts"

  if run_test_file "$runtime_dir" "tests/extension-units/till-done.test.ts" "$out"; then
    local detail="till-done mutation blocking, validation gate, lighter docs path, and active-task allow-path tests passed."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  else
    local detail="till-done unit tests failed."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  fi
}

check_3_orchestration_helper_unit_tests() {
  local name="3. routing/team/packet/handoff helper unit tests"
  local out="$TMP_ROOT/check_3_orchestration_helper_unit_tests.txt"
  local runtime_dir="$TMP_ROOT/unit-runtime"
  local cmd="cd $runtime_dir && $NODE_BIN --import tsx --test tests/extension-units/orchestration-helpers.test.ts"

  if run_test_file "$runtime_dir" "tests/extension-units/orchestration-helpers.test.ts" "$out"; then
    local detail="routing, team activation, task packet, and handoff helper unit tests passed."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  else
    local detail="routing/team/packet/handoff helper unit tests failed."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  fi
}

check_4_queue_runner_unit_tests() {
  local name="4. queue-runner bounded step unit tests"
  local out="$TMP_ROOT/check_4_queue_runner_unit_tests.txt"
  local runtime_dir="$TMP_ROOT/unit-runtime"
  local cmd="cd $runtime_dir && $NODE_BIN --import tsx --test tests/extension-units/queue-runner.test.ts"

  if run_test_file "$runtime_dir" "tests/extension-units/queue-runner.test.ts" "$out"; then
    local detail="queue-runner unit tests passed for empty/paused no-ops, deterministic single-job start/finalize, stop-condition enforcement for retries/runtime/failed validations/approval boundaries, unsupported-control blocking, compensation safety, and recovery reuse."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  else
    local detail="queue-runner unit tests failed."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  fi
}

check_5_graphify_adapter_unit_tests() {
  local name="5. Graphify adapter safety unit tests"
  local out="$TMP_ROOT/check_5_graphify_adapter_unit_tests.txt"
  local runtime_dir="$TMP_ROOT/unit-runtime"
  local cmd="cd $runtime_dir && $NODE_BIN --import tsx --test tests/extension-units/graphify-adapter.test.ts"

  if run_test_file "$runtime_dir" "tests/extension-units/graphify-adapter.test.ts" "$out"; then
    local detail="Graphify adapter unit tests passed for installed/missing binary behavior, managed graph query, large-corpus approval, and managed output paths."
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

check_6_discovery_policy_unit_tests() {
  local name="6. discovery-policy selector unit tests"
  local out="$TMP_ROOT/check_6_discovery_policy_unit_tests.txt"
  local runtime_dir="$TMP_ROOT/unit-runtime"
  local cmd="cd $runtime_dir && $NODE_BIN --import tsx --test tests/extension-units/discovery-policy.test.ts"

  if run_test_file "$runtime_dir" "tests/extension-units/discovery-policy.test.ts" "$out"; then
    local detail="discovery-policy selector tests passed for Auggie, Graphify, local read/rg/find, Exa, and unavailable-index fallback choices."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  else
    local detail="discovery-policy selector unit tests failed."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  fi
}

check_7_graphify_validation_decision_unit_tests() {
  local name="7. Graphify validation decision unit tests"
  local out="$TMP_ROOT/check_7_graphify_validation_decision_unit_tests.txt"
  local runtime_dir="$TMP_ROOT/unit-runtime"
  local cmd="cd $runtime_dir && $NODE_BIN --import tsx --test tests/extension-units/graphify-validation-decision.test.ts"

  if run_test_file "$runtime_dir" "tests/extension-units/graphify-validation-decision.test.ts" "$out"; then
    local detail="Graphify validation decision tests passed for explicit states, required missing proof blocking, optional skip, source verification, and pass behavior."
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

setup_temp_runtime
write_header
check_1_safe_bash_unit_tests
check_2_till_done_unit_tests
check_3_orchestration_helper_unit_tests
check_4_queue_runner_unit_tests
check_5_graphify_adapter_unit_tests
check_6_discovery_policy_unit_tests
check_8_graphify_orchestration_decision_unit_tests() {
  local name="8. Graphify orchestration decision unit tests"
  local out="$TMP_ROOT/check_8_graphify_orchestration_decision_unit_tests.txt"
  local runtime_dir="$TMP_ROOT/unit-runtime"
  local cmd="cd $runtime_dir && $NODE_BIN --import tsx --test tests/extension-units/graphify-orchestration-decision.test.ts"

  if run_test_file "$runtime_dir" "tests/extension-units/graphify-orchestration-decision.test.ts" "$out"; then
    local detail="Graphify orchestration decision tests passed for explicit actions, local fallback, unavailable Graphify, preflight/approval/scan, freshness, query/source proof, and ready behavior."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  else
    local detail="Graphify orchestration decision unit tests failed."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  fi
}

check_9_graphify_orchestrator_unit_tests() {
  local name="9. Graphify orchestrator runtime command unit tests"
  local out="$TMP_ROOT/check_9_graphify_orchestrator_unit_tests.txt"
  local runtime_dir="$TMP_ROOT/unit-runtime"
  local cmd="cd $runtime_dir && $NODE_BIN --import tsx --test tests/extension-units/graphify-orchestrator.test.ts"

  if run_test_file "$runtime_dir" "tests/extension-units/graphify-orchestrator.test.ts" "$out"; then
    local detail="Graphify orchestrator runtime command tests passed for graphify_adapter preflight/scan/freshness/query delegation, local fallback, and forbidden watch args."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  else
    local detail="Graphify orchestrator runtime command unit tests failed."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  fi
}

check_10_execution_leases_unit_tests() {
  local name="10. execution-leases helper unit tests"
  local out="$TMP_ROOT/check_10_execution_leases_unit_tests.txt"
  local runtime_dir="$TMP_ROOT/unit-runtime"
  local cmd="cd $runtime_dir && $NODE_BIN --import tsx --test tests/extension-units/execution-leases.test.ts"

  if run_test_file "$runtime_dir" "tests/extension-units/execution-leases.test.ts" "$out"; then
    local detail="execution-leases unit tests passed for default load, acquire/release, conflict rejection, expired lease pruning, and summary behavior."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  else
    local detail="execution-leases helper unit tests failed."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  fi
}

check_11_product_slice_lifecycle_unit_tests() {
  local name="11. product-slice lifecycle unit tests"
  local out="$TMP_ROOT/check_11_product_slice_lifecycle_unit_tests.txt"
  local runtime_dir="$TMP_ROOT/unit-runtime"
  local cmd="cd $runtime_dir && $NODE_BIN --import tsx --test tests/extension-units/product-slice-lifecycle.test.ts"

  if run_test_file "$runtime_dir" "tests/extension-units/product-slice-lifecycle.test.ts" "$out"; then
    local detail="product-slice lifecycle tests passed for schema load/validation, phase order, blocked skips, same-slice parallel blocking, and FE-before-BE sequencing."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  else
    local detail="product-slice lifecycle unit tests failed."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  fi
}

check_7_graphify_validation_decision_unit_tests
check_8_graphify_orchestration_decision_unit_tests
check_9_graphify_orchestrator_unit_tests
check_10_execution_leases_unit_tests
check_11_product_slice_lifecycle_unit_tests

cat "$SUMMARY_TABLE_FILE" >> "$REPORT_PATH"
cat "$DETAILS_FILE" >> "$REPORT_PATH"
cat >> "$REPORT_PATH" <<EOF

## Final Decision
- Overall status: $( [[ $FAILED_CHECKS -eq 0 ]] && echo PASS || echo FAIL )
- Failed checks: $FAILED_CHECKS
- Summary JSON: $SUMMARY_JSON_PATH
EOF

write_json_summary

if [[ $FAILED_CHECKS -eq 0 ]]; then
  echo "Extension unit-test validation PASS"
  echo "Report: $REPORT_PATH"
  echo "Summary JSON: $SUMMARY_JSON_PATH"
  exit 0
else
  echo "Extension unit-test validation FAIL"
  echo "Report: $REPORT_PATH"
  echo "Summary JSON: $SUMMARY_JSON_PATH"
  exit 1
fi
