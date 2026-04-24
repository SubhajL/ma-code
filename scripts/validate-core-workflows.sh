#!/usr/bin/env bash
set -u -o pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DATE_STAMP="$(date +%F)"
REPORT_DIR="$REPO_ROOT/reports/validation"
DEFAULT_REPORT="$REPORT_DIR/${DATE_STAMP}_core-workflows-validation-script.md"
DEFAULT_SUMMARY_JSON="$REPORT_DIR/${DATE_STAMP}_core-workflows-validation-script.json"
NODE_BIN="${NODE_BIN:-node}"
NPM_BIN="${NPM_BIN:-npm}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
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
# Automated Validation Report — Core Workflows

- Date: $DATE_STAMP
- Generated at: $(date '+%Y-%m-%dT%H:%M:%S%z')
- Repo root: $REPO_ROOT
- Node binary: $NODE_BIN
- npm binary: $NPM_BIN
- Python binary: $PYTHON_BIN
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
with open(names_path, encoding="utf-8") as f:
    names = [line.rstrip("\n") for line in f]
with open(statuses_path, encoding="utf-8") as f:
    statuses = [line.rstrip("\n") for line in f]
with open(details_path, encoding="utf-8") as f:
    details = [line.rstrip("\n") for line in f]
checks = [{"name": n, "status": s, "detail": d} for n, s, d in zip(names, statuses, details)]
summary = {"status": "PASS" if int(failed) == 0 else "FAIL", "failedChecks": int(failed), "checks": checks}
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(summary, f, indent=2)
    f.write("\n")
PY
}

setup_temp_runtime() {
  local workdir="$TMP_ROOT/core-workflows-runtime"
  mkdir -p \
    "$workdir/.pi/agent/extensions" \
    "$workdir/.pi/agent/teams" \
    "$workdir/.pi/agent/packets" \
    "$workdir/.pi/agent/handoffs" \
    "$workdir/.pi/agent/validation" \
    "$workdir/.pi/agent/recovery" \
    "$workdir/scripts" \
    "$workdir/tests/extension-units" \
    "$workdir/tests/integration"

  cat > "$workdir/package.json" <<'JSON'
{
  "name": "ma-harness-core-workflows-validation",
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

  cp "$REPO_ROOT/.pi/agent/extensions/"{safe-bash,till-done,harness-routing,team-activation,task-packets,handoffs,recovery-policy,recovery-runtime,queue-runner}.ts "$workdir/.pi/agent/extensions/"
  cp "$REPO_ROOT/.pi/agent/models.json" "$workdir/.pi/agent/models.json"
  cp "$REPO_ROOT/.pi/agent/teams/activation-policy.json" "$workdir/.pi/agent/teams/activation-policy.json"
  cp "$REPO_ROOT/.pi/agent/teams/"*.yaml "$workdir/.pi/agent/teams/"
  cp "$REPO_ROOT/.pi/agent/packets/packet-policy.json" "$workdir/.pi/agent/packets/packet-policy.json"
  cp "$REPO_ROOT/.pi/agent/handoffs/handoff-policy.json" "$workdir/.pi/agent/handoffs/handoff-policy.json"
  cp "$REPO_ROOT/.pi/agent/validation/completion-gate-policy.json" "$workdir/.pi/agent/validation/completion-gate-policy.json"
  cp "$REPO_ROOT/.pi/agent/recovery/recovery-policy.json" "$workdir/.pi/agent/recovery/recovery-policy.json"
  cp "$REPO_ROOT/tests/extension-units/test-utils.ts" "$workdir/tests/extension-units/"
  cp "$REPO_ROOT/scripts/harness-operator-status.ts" "$workdir/scripts/"
  cp "$REPO_ROOT/tests/integration/"{core-workflows,operator-surface}.test.ts "$workdir/tests/integration/"

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

check_1_compile_core_workflow_extensions() {
  local name="1. core workflow extensions compile together"
  local out="$TMP_ROOT/check_1_compile_core_workflow_extensions.txt"
  local runtime_dir="$TMP_ROOT/core-workflows-runtime"
  local cmd="cd $runtime_dir && npx tsc --noEmit --skipLibCheck --allowImportingTsExtensions --moduleResolution nodenext --module nodenext --target es2022 --lib es2022,dom --types node .pi/agent/extensions/safe-bash.ts .pi/agent/extensions/till-done.ts .pi/agent/extensions/harness-routing.ts .pi/agent/extensions/team-activation.ts .pi/agent/extensions/task-packets.ts .pi/agent/extensions/handoffs.ts .pi/agent/extensions/recovery-policy.ts .pi/agent/extensions/recovery-runtime.ts .pi/agent/extensions/queue-runner.ts scripts/harness-operator-status.ts"

  if (
    cd "$runtime_dir" &&
    npx tsc --noEmit --skipLibCheck --allowImportingTsExtensions --moduleResolution nodenext --module nodenext --target es2022 --lib es2022,dom --types node \
      .pi/agent/extensions/safe-bash.ts \
      .pi/agent/extensions/till-done.ts \
      .pi/agent/extensions/harness-routing.ts \
      .pi/agent/extensions/team-activation.ts \
      .pi/agent/extensions/task-packets.ts \
      .pi/agent/extensions/handoffs.ts \
      .pi/agent/extensions/recovery-policy.ts \
      .pi/agent/extensions/recovery-runtime.ts \
      .pi/agent/extensions/queue-runner.ts \
      scripts/harness-operator-status.ts >"$out" 2>&1
  ); then
    local detail="safe-bash, till-done, queue-runner, the operator status script, and their routing/team/packet/handoff/recovery dependencies compile together in an isolated runtime package."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  else
    local detail="core workflow extension compile check failed."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  fi
}

check_2_core_workflow_integration_tests() {
  local name="2. core workflow integration tests"
  local out="$TMP_ROOT/check_2_core_workflow_integration_tests.txt"
  local runtime_dir="$TMP_ROOT/core-workflows-runtime"
  local cmd="cd $runtime_dir && $NODE_BIN --import tsx --test tests/integration/core-workflows.test.ts"

  if run_test_file "$runtime_dir" "tests/integration/core-workflows.test.ts" "$out"; then
    local detail="integration tests passed for docs-only completion, implementation pass, validation fail visibility, recovery finalization, and safe-bash/provider recovery block handling."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  else
    local detail="core workflow integration tests failed."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  fi
}

check_3_operator_surface_integration() {
  local name="3. operator status integration surface"
  local out="$TMP_ROOT/check_3_operator_surface_integration.txt"
  local runtime_dir="$TMP_ROOT/core-workflows-runtime"
  local cmd="cd $runtime_dir && $NODE_BIN --import tsx --test tests/integration/operator-surface.test.ts"

  if run_test_file "$runtime_dir" "tests/integration/operator-surface.test.ts" "$out"; then
    local detail="operator status integration tests passed for readable text output and stable JSON output from the lightweight CLI status surface."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  else
    local detail="operator status integration tests failed."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  fi
}

check_4_operator_surface_wiring() {
  local name="4. operator surface/package/docs wiring"
  local out="$TMP_ROOT/check_4_operator_surface_wiring.txt"
  local cmd="$PYTHON_BIN $TMP_ROOT/check_4_operator_surface_wiring.py"

  cat > "$TMP_ROOT/check_4_operator_surface_wiring.py" <<'PY'
import json
import sys
from pathlib import Path
root = Path(sys.argv[1])
package = json.loads((root / 'package.json').read_text(encoding='utf-8'))
scripts = package.get('scripts', {})
checks = {
    'package.json:harness:status': 'harness:status' in scripts,
    'package.json:test:operator-surface': 'test:operator-surface' in scripts,
    'README.md': 'harness:status' in (root / 'README.md').read_text(encoding='utf-8'),
    '.pi/agent/docs/operator_workflow.md': 'harness:status' in (root / '.pi/agent/docs/operator_workflow.md').read_text(encoding='utf-8'),
    '.pi/agent/docs/validation_architecture.md': 'operator status' in (root / '.pi/agent/docs/validation_architecture.md').read_text(encoding='utf-8').lower(),
}
missing = [name for name, ok in checks.items() if not ok]
assert not missing, f'missing operator surface wiring in: {missing}'
print('operator-surface-wiring-ok')
PY

  if "$PYTHON_BIN" "$TMP_ROOT/check_4_operator_surface_wiring.py" "$REPO_ROOT" >"$out" 2>&1; then
    local detail="operator status/package/docs wiring is present in package scripts, README, and validation/operator docs."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  else
    local detail="operator surface/package/docs wiring is incomplete."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  fi
}

main() {
  write_header
  setup_temp_runtime
  check_1_compile_core_workflow_extensions
  check_2_core_workflow_integration_tests
  check_3_operator_surface_integration
  check_4_operator_surface_wiring

  cat "$SUMMARY_TABLE_FILE" >> "$REPORT_PATH"
  cat >> "$REPORT_PATH" <<EOF

## Detailed Results
EOF
  cat "$DETAILS_FILE" >> "$REPORT_PATH"
  write_json_summary

  if [[ $FAILED_CHECKS -gt 0 ]]; then
    echo "core-workflows-validation: FAIL ($FAILED_CHECKS checks failed)" >&2
    return 1
  fi

  echo "core-workflows-validation: PASS"
  echo "report: $REPORT_PATH"
  echo "summary: $SUMMARY_JSON_PATH"
}

main "$@"
