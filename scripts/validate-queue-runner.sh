#!/usr/bin/env bash
set -u -o pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DATE_STAMP="$(date +%F)"
REPORT_DIR="$REPO_ROOT/reports/validation"
DEFAULT_REPORT="$REPORT_DIR/${DATE_STAMP}_queue-runner-validation-script.md"
DEFAULT_SUMMARY_JSON="$REPORT_DIR/${DATE_STAMP}_queue-runner-validation-script.json"
NODE_BIN="${NODE_BIN:-node}"
NPM_BIN="${NPM_BIN:-npm}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
PI_BIN="${PI_BIN:-pi}"
REPORT_PATH="$DEFAULT_REPORT"
SUMMARY_JSON_PATH="$DEFAULT_SUMMARY_JSON"
KEEP_TEMP=0
INCLUDE_LIVE=1
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
  --skip-live              Skip the bounded live probe for run_next_queue_job
  --include-live           Compatibility alias to keep the live probe enabled
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
    --skip-live)
      INCLUDE_LIVE=0
      shift
      ;;
    --include-live)
      INCLUDE_LIVE=1
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
# Automated Validation Report — Queue Runner

- Date: $DATE_STAMP
- Generated at: $(date '+%Y-%m-%dT%H:%M:%S%z')
- Repo root: $REPO_ROOT
- Node binary: $NODE_BIN
- npm binary: $NPM_BIN
- Python binary: $PYTHON_BIN
- Live probe enabled: $( [[ $INCLUDE_LIVE -eq 1 ]] && echo yes || echo no )
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
  local workdir="$TMP_ROOT/queue-runner-runtime"
  mkdir -p \
    "$workdir/.pi/agent/extensions" \
    "$workdir/.pi/agent/teams" \
    "$workdir/.pi/agent/packets" \
    "$workdir/.pi/agent/handoffs" \
    "$workdir/.pi/agent/validation" \
    "$workdir/.pi/agent/recovery" \
    "$workdir/tests/extension-units"

  cat > "$workdir/package.json" <<'JSON'
{
  "name": "ma-harness-queue-runner-validation",
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

  cp "$REPO_ROOT/.pi/agent/extensions/"{till-done,harness-routing,team-activation,task-packets,handoffs,recovery-policy,recovery-runtime,queue-runner}.ts "$workdir/.pi/agent/extensions/"
  cp "$REPO_ROOT/.pi/agent/models.json" "$workdir/.pi/agent/models.json"
  cp "$REPO_ROOT/.pi/agent/teams/activation-policy.json" "$workdir/.pi/agent/teams/activation-policy.json"
  cp "$REPO_ROOT/.pi/agent/teams/"*.yaml "$workdir/.pi/agent/teams/"
  cp "$REPO_ROOT/.pi/agent/packets/packet-policy.json" "$workdir/.pi/agent/packets/packet-policy.json"
  cp "$REPO_ROOT/.pi/agent/handoffs/handoff-policy.json" "$workdir/.pi/agent/handoffs/handoff-policy.json"
  cp "$REPO_ROOT/.pi/agent/validation/completion-gate-policy.json" "$workdir/.pi/agent/validation/completion-gate-policy.json"
  cp "$REPO_ROOT/.pi/agent/recovery/recovery-policy.json" "$workdir/.pi/agent/recovery/recovery-policy.json"
  cp "$REPO_ROOT/tests/extension-units/test-utils.ts" "$workdir/tests/extension-units/"
  cp "$REPO_ROOT/tests/extension-units/queue-runner.test.ts" "$workdir/tests/extension-units/"

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

check_1_compile_queue_runner() {
  local name="1. queue-runner extension compiles with its shared helpers"
  local out="$TMP_ROOT/check_1_compile_queue_runner.txt"
  local runtime_dir="$TMP_ROOT/queue-runner-runtime"
  local cmd="cd $runtime_dir && npx tsc --noEmit --skipLibCheck --allowImportingTsExtensions --moduleResolution nodenext --module nodenext --target es2022 --lib es2022,dom --types node .pi/agent/extensions/till-done.ts .pi/agent/extensions/harness-routing.ts .pi/agent/extensions/team-activation.ts .pi/agent/extensions/task-packets.ts .pi/agent/extensions/handoffs.ts .pi/agent/extensions/recovery-policy.ts .pi/agent/extensions/recovery-runtime.ts .pi/agent/extensions/queue-runner.ts"

  if (
    cd "$runtime_dir" &&
    npx tsc --noEmit --skipLibCheck --allowImportingTsExtensions --moduleResolution nodenext --module nodenext --target es2022 --lib es2022,dom --types node \
      .pi/agent/extensions/till-done.ts \
      .pi/agent/extensions/harness-routing.ts \
      .pi/agent/extensions/team-activation.ts \
      .pi/agent/extensions/task-packets.ts \
      .pi/agent/extensions/handoffs.ts \
      .pi/agent/extensions/recovery-policy.ts \
      .pi/agent/extensions/recovery-runtime.ts \
      .pi/agent/extensions/queue-runner.ts >"$out" 2>&1
  ); then
    local detail="queue-runner and its till-done/routing/team/packet/handoff/recovery dependencies compile together."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  else
    local detail="queue-runner compile check failed."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  fi
}

check_2_queue_runner_unit_tests() {
  local name="2. queue-runner unit tests"
  local out="$TMP_ROOT/check_2_queue_runner_unit_tests.txt"
  local runtime_dir="$TMP_ROOT/queue-runner-runtime"
  local cmd="cd $runtime_dir && $NODE_BIN --import tsx --test tests/extension-units/queue-runner.test.ts"

  if run_test_file "$runtime_dir" "tests/extension-units/queue-runner.test.ts" "$out"; then
    local detail="queue-runner unit tests passed for empty/paused no-ops, deterministic one-job start/finalize, stop-condition enforcement for retries/runtime/failed validations/approval boundaries, unsupported-control blocking, compensation safety, and recovery reuse."
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

check_3_queue_runner_wiring() {
  local name="3. queue-runner validator and docs wiring"
  local out="$TMP_ROOT/check_3_queue_runner_wiring.txt"
  local cmd="$PYTHON_BIN $TMP_ROOT/check_3_queue_runner_wiring.py"

  cat > "$TMP_ROOT/check_3_queue_runner_wiring.py" <<'PY'
import sys
from pathlib import Path
root = Path(sys.argv[1])
checks = {
    'README.md': 'queue-runner validator' in (root / 'README.md').read_text(encoding='utf-8'),
    '.pi/agent/docs/operator_workflow.md': './scripts/validate-queue-runner.sh' in (root / '.pi/agent/docs/operator_workflow.md').read_text(encoding='utf-8'),
    '.pi/agent/docs/validation_architecture.md': 'scripts/validate-queue-runner.sh' in (root / '.pi/agent/docs/validation_architecture.md').read_text(encoding='utf-8'),
    'scripts/check-repo-static.sh': 'scripts/validate-queue-runner.sh' in (root / 'scripts/check-repo-static.sh').read_text(encoding='utf-8'),
    '.github/workflows/ci.yml': 'Run queue-runner validator' in (root / '.github/workflows/ci.yml').read_text(encoding='utf-8'),
}
missing = [name for name, ok in checks.items() if not ok]
assert not missing, f'missing queue-runner wiring in: {missing}'
print('queue-runner-wiring-ok')
PY

  if "$PYTHON_BIN" "$TMP_ROOT/check_3_queue_runner_wiring.py" "$REPO_ROOT" >"$out" 2>&1; then
    local detail="queue-runner validator and docs wiring are present in README, operator workflow, validation architecture, static checks, and CI."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  else
    local detail="queue-runner validator or docs wiring is incomplete."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  fi
}

probe_unavailable() {
  local file="$1"
  grep -Eq 'No API key found|No configured auth is available|credit balance is too low|invalid_request_error|No models match pattern|authentication|usage limit|ChatGPT usage limit|team plan' "$file"
}

check_4_live_queue_runner_probe() {
  local name="4. live run_next_queue_job tool probe"
  local out="$TMP_ROOT/check_4_live_queue_runner_probe.txt"
  local runtime_dir="$TMP_ROOT/queue-runner-runtime"
  local cmd="cd $runtime_dir && $PI_BIN --no-session --no-extensions -e $runtime_dir/.pi/agent/extensions/till-done.ts -e $runtime_dir/.pi/agent/extensions/harness-routing.ts -e $runtime_dir/.pi/agent/extensions/team-activation.ts -e $runtime_dir/.pi/agent/extensions/task-packets.ts -e $runtime_dir/.pi/agent/extensions/handoffs.ts -e $runtime_dir/.pi/agent/extensions/recovery-policy.ts -e $runtime_dir/.pi/agent/extensions/recovery-runtime.ts -e $runtime_dir/.pi/agent/extensions/queue-runner.ts --mode json \"Use run_next_queue_job and report the returned action in one sentence.\""

  if [[ $INCLUDE_LIVE -eq 0 ]]; then
    local detail="Live probe skipped because --skip-live was requested explicitly."
    record_result "$name" "SKIP" "$detail"
    append_summary_row "$name" "SKIP" "$detail"
    append_check_section "$name" "SKIP" "$cmd" "- live probe not run because --skip-live was requested"
    return
  fi

  if ! command -v "$PI_BIN" >/dev/null 2>&1; then
    local detail="Live probe skipped because the configured Pi binary was not available in PATH."
    record_result "$name" "SKIP" "$detail"
    append_summary_row "$name" "SKIP" "$detail"
    append_check_section "$name" "SKIP" "$cmd" "- missing Pi binary: $PI_BIN"
    return
  fi

  if (
    cd "$runtime_dir" &&
    "$PI_BIN" --no-session --no-extensions \
      -e "$runtime_dir/.pi/agent/extensions/till-done.ts" \
      -e "$runtime_dir/.pi/agent/extensions/harness-routing.ts" \
      -e "$runtime_dir/.pi/agent/extensions/team-activation.ts" \
      -e "$runtime_dir/.pi/agent/extensions/task-packets.ts" \
      -e "$runtime_dir/.pi/agent/extensions/handoffs.ts" \
      -e "$runtime_dir/.pi/agent/extensions/recovery-policy.ts" \
      -e "$runtime_dir/.pi/agent/extensions/recovery-runtime.ts" \
      -e "$runtime_dir/.pi/agent/extensions/queue-runner.ts" \
      --mode json "Use run_next_queue_job and report the returned action in one sentence." >"$out" 2>&1
  ); then
    if probe_unavailable "$out"; then
      local detail="Live probe skipped because provider/auth/model access was unavailable in this environment."
      record_result "$name" "SKIP" "$detail"
      append_summary_row "$name" "SKIP" "$detail"
      append_check_section "$name" "SKIP" "$cmd" "- output indicated provider/auth/model unavailability:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
    elif grep -Fq '"toolName":"run_next_queue_job"' "$out"; then
      local detail="Live probe observed the run_next_queue_job tool call."
      record_result "$name" "PASS" "$detail"
      append_summary_row "$name" "PASS" "$detail"
      append_check_section "$name" "PASS" "$cmd" "- tool call observed: \`run_next_queue_job\`"
    else
      local detail="Live probe ran but did not show the expected tool call."
      record_result "$name" "FAIL" "$detail"
      append_summary_row "$name" "FAIL" "$detail"
      append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
    fi
  elif probe_unavailable "$out"; then
    local detail="Live probe skipped because provider/auth/model access was unavailable in this environment."
    record_result "$name" "SKIP" "$detail"
    append_summary_row "$name" "SKIP" "$detail"
    append_check_section "$name" "SKIP" "$cmd" "- output indicated provider/auth/model unavailability:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  else
    local detail="Live probe failed unexpectedly."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  fi
}

setup_temp_runtime
write_header
check_1_compile_queue_runner
check_2_queue_runner_unit_tests
check_3_queue_runner_wiring
check_4_live_queue_runner_probe

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
  echo "Queue-runner validation PASS"
  echo "Report: $REPORT_PATH"
  echo "Summary JSON: $SUMMARY_JSON_PATH"
  exit 0
else
  echo "Queue-runner validation FAIL"
  echo "Report: $REPORT_PATH"
  echo "Summary JSON: $SUMMARY_JSON_PATH"
  exit 1
fi
