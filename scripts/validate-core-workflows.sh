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
    "$workdir/.pi/agent/lifecycle" \
    "$workdir/.pi/agent/release" \
    "$workdir/.pi/agent/docs" \
    "$workdir/.pi/agent/recovery" \
    "$workdir/.pi/agent/schedules" \
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

  cp "$REPO_ROOT/.pi/agent/extensions/"{safe-bash,till-done,harness-routing,team-activation,domain-governance,task-packets,handoffs,recovery-policy,recovery-runtime,execution-leases,queue-runner,graphify-adapter}.ts "$workdir/.pi/agent/extensions/"
  cp "$REPO_ROOT/.pi/agent/extensions/graphify-validation-decision.ts" "$workdir/.pi/agent/extensions/"
  cp "$REPO_ROOT/.pi/agent/extensions/graphify-orchestration-decision.ts" "$workdir/.pi/agent/extensions/"
  cp "$REPO_ROOT/.pi/agent/extensions/graphify-orchestrator.ts" "$workdir/.pi/agent/extensions/"
  cp "$REPO_ROOT/.pi/agent/extensions/slice-lifecycle.ts" "$workdir/.pi/agent/extensions/"
  cp "$REPO_ROOT/.pi/agent/models.json" "$workdir/.pi/agent/models.json"
  cp "$REPO_ROOT/.pi/agent/teams/activation-policy.json" "$workdir/.pi/agent/teams/activation-policy.json"
  cp "$REPO_ROOT/.pi/agent/teams/"*.yaml "$workdir/.pi/agent/teams/"
  cp "$REPO_ROOT/.pi/agent/packets/packet-policy.json" "$workdir/.pi/agent/packets/packet-policy.json"
  cp "$REPO_ROOT/.pi/agent/handoffs/handoff-policy.json" "$workdir/.pi/agent/handoffs/handoff-policy.json"
  cp "$REPO_ROOT/.pi/agent/validation/completion-gate-policy.json" "$workdir/.pi/agent/validation/completion-gate-policy.json"
  cp "$REPO_ROOT/.pi/agent/recovery/recovery-policy.json" "$workdir/.pi/agent/recovery/recovery-policy.json"
  cp "$REPO_ROOT/.pi/agent/lifecycle/slice-lifecycle-policy.json" "$workdir/.pi/agent/lifecycle/slice-lifecycle-policy.json"
  cp "$REPO_ROOT/.pi/agent/release/merge-release-policy.json" "$workdir/.pi/agent/release/merge-release-policy.json"
  cp "$REPO_ROOT/.pi/agent/docs/slice_lifecycle.md" "$workdir/.pi/agent/docs/slice_lifecycle.md"
  cp "$REPO_ROOT/.pi/agent/docs/merge_release_policy.md" "$workdir/.pi/agent/docs/merge_release_policy.md"
  cp "$REPO_ROOT/.pi/agent/schedules/scheduled-workflows.json" "$workdir/.pi/agent/schedules/scheduled-workflows.json"
  cp "$REPO_ROOT/tests/extension-units/test-utils.ts" "$workdir/tests/extension-units/"
  cp "$REPO_ROOT/scripts/"{harness-operator,harness-operator-status,harness-operator-leases,harness-queue-session,harness-scheduled-workflows,harness-worktree,harness-integrate,harness-worker-session,harness-pr-gate,harness-sync-main,harness-slice-lifecycle,harness-merge}.ts "$workdir/scripts/"
  cp "$REPO_ROOT/tests/integration/"{core-workflows,operator-surface,operator-leases,operator-control-plane,queue-session,scheduled-workflows,worktree-helper,integrate-worktree,worker-session,graphify-adapter,pr-gate,sync-main,slice-lifecycle,merge-helper}.test.ts "$workdir/tests/integration/"

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
  local cmd="cd $runtime_dir && npx tsc --noEmit --skipLibCheck --allowImportingTsExtensions --moduleResolution nodenext --module nodenext --target es2022 --lib es2022,dom --types node .pi/agent/extensions/safe-bash.ts .pi/agent/extensions/till-done.ts .pi/agent/extensions/harness-routing.ts .pi/agent/extensions/team-activation.ts .pi/agent/extensions/domain-governance.ts .pi/agent/extensions/task-packets.ts .pi/agent/extensions/handoffs.ts .pi/agent/extensions/recovery-policy.ts .pi/agent/extensions/recovery-runtime.ts .pi/agent/extensions/execution-leases.ts .pi/agent/extensions/queue-runner.ts .pi/agent/extensions/graphify-adapter.ts .pi/agent/extensions/graphify-validation-decision.ts .pi/agent/extensions/graphify-orchestration-decision.ts .pi/agent/extensions/graphify-orchestrator.ts .pi/agent/extensions/slice-lifecycle.ts scripts/harness-operator.ts scripts/harness-operator-status.ts scripts/harness-operator-leases.ts scripts/harness-queue-session.ts scripts/harness-scheduled-workflows.ts scripts/harness-worktree.ts scripts/harness-integrate.ts scripts/harness-worker-session.ts scripts/harness-pr-gate.ts scripts/harness-sync-main.ts scripts/harness-slice-lifecycle.ts scripts/harness-merge.ts"

  if (
    cd "$runtime_dir" &&
    npx tsc --noEmit --skipLibCheck --allowImportingTsExtensions --moduleResolution nodenext --module nodenext --target es2022 --lib es2022,dom --types node \
      .pi/agent/extensions/safe-bash.ts \
      .pi/agent/extensions/till-done.ts \
      .pi/agent/extensions/harness-routing.ts \
      .pi/agent/extensions/team-activation.ts \
      .pi/agent/extensions/domain-governance.ts \
      .pi/agent/extensions/task-packets.ts \
      .pi/agent/extensions/handoffs.ts \
      .pi/agent/extensions/recovery-policy.ts \
      .pi/agent/extensions/recovery-runtime.ts \
      .pi/agent/extensions/execution-leases.ts \
      .pi/agent/extensions/queue-runner.ts \
      .pi/agent/extensions/graphify-adapter.ts \
      .pi/agent/extensions/graphify-validation-decision.ts \
      .pi/agent/extensions/graphify-orchestration-decision.ts \
      .pi/agent/extensions/graphify-orchestrator.ts \
      .pi/agent/extensions/slice-lifecycle.ts \
      scripts/harness-operator.ts \
      scripts/harness-operator-status.ts \
      scripts/harness-operator-leases.ts \
      scripts/harness-queue-session.ts \
      scripts/harness-scheduled-workflows.ts \
      scripts/harness-worktree.ts \
      scripts/harness-integrate.ts \
      scripts/harness-worker-session.ts \
      scripts/harness-pr-gate.ts \
      scripts/harness-sync-main.ts \
      scripts/harness-slice-lifecycle.ts \
      scripts/harness-merge.ts >"$out" 2>&1
  ); then
    local detail="safe-bash, till-done, queue-runner, Graphify orchestration, and the operator-facing operator/status/leases/queue-session/scheduled-workflow/worktree/integrate/worker-session/PR-gate/sync-main helper scripts compile together with their routing/team/packet/handoff/recovery dependencies in an isolated runtime package."
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

check_operator_leases_integration() {
  local name="4. operator leases integration surface"
  local out="$TMP_ROOT/check_operator_leases_integration.txt"
  local runtime_dir="$TMP_ROOT/core-workflows-runtime"
  local cmd="cd $runtime_dir && $NODE_BIN --import tsx --test tests/integration/operator-leases.test.ts"

  if run_test_file "$runtime_dir" "tests/integration/operator-leases.test.ts" "$out"; then
    local detail="operator lease integration tests passed for text/JSON list output and stale-only cleanup that preserves active leases."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  else
    local detail="operator lease integration tests failed."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  fi
}

check_operator_control_plane_integration() {
  local name="4a. unified operator control-plane integration surface"
  local out="$TMP_ROOT/check_operator_control_plane_integration.txt"
  local runtime_dir="$TMP_ROOT/core-workflows-runtime"
  local cmd="cd $runtime_dir && $NODE_BIN --import tsx --test tests/integration/operator-control-plane.test.ts"

  if run_test_file "$runtime_dir" "tests/integration/operator-control-plane.test.ts" "$out"; then
    local detail="operator control-plane integration tests passed for help, delegated status/queue-session/worktree/leases/worker-session behavior, unknown-subcommand failure, and delegated non-zero exit handling."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  else
    local detail="operator control-plane integration tests failed."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  fi
}

check_slice_lifecycle_integration() {
  local name="4b. slice lifecycle integration surface"
  local out="$TMP_ROOT/check_slice_lifecycle_integration.txt"
  local runtime_dir="$TMP_ROOT/core-workflows-runtime"
  local cmd="cd $runtime_dir && $NODE_BIN --import tsx --test tests/integration/slice-lifecycle.test.ts"

  if run_test_file "$runtime_dir" "tests/integration/slice-lifecycle.test.ts" "$out"; then
    local detail="slice lifecycle integration tests passed for create_ready, missing GREEN/g-check blockers, merge_ready, and explicit merged/local-main-synced evidence."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  else
    local detail="slice lifecycle integration tests failed."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  fi
}

check_merge_helper_integration() {
  local name="4c. merge helper integration surface"
  local out="$TMP_ROOT/check_merge_helper_integration.txt"
  local runtime_dir="$TMP_ROOT/core-workflows-runtime"
  local cmd="cd $runtime_dir && $NODE_BIN --import tsx --test tests/integration/merge-helper.test.ts"

  if run_test_file "$runtime_dir" "tests/integration/merge-helper.test.ts" "$out"; then
    local detail="merge helper integration tests passed for lifecycle readiness blockers, ready checks, dirty apply blocking, successful apply, and explicit-only sync-main behavior."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  else
    local detail="merge helper integration tests failed."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  fi
}

check_4_queue_session_integration() {
  local name="4. queue session integration surface"
  local out="$TMP_ROOT/check_4_queue_session_integration.txt"
  local runtime_dir="$TMP_ROOT/core-workflows-runtime"
  local cmd="cd $runtime_dir && $NODE_BIN --import tsx --test tests/integration/queue-session.test.ts"

  if run_test_file "$runtime_dir" "tests/integration/queue-session.test.ts" "$out"; then
    local detail="queue session integration tests passed for waiting-point starts, finalize-then-start chaining with invalid-queue skipping, blocked+failed visibility, paused-queue boundaries, recovery-action triage visibility, scheduled-workflow job provenance through sessions, and explicit max-step/max-runtime stopping."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  else
    local detail="queue session integration tests failed."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  fi
}

check_5_worktree_helper_integration() {
  local name="5. worktree helper integration surface"
  local out="$TMP_ROOT/check_4_worktree_helper_integration.txt"
  local runtime_dir="$TMP_ROOT/core-workflows-runtime"
  local cmd="cd $runtime_dir && $NODE_BIN --import tsx --test tests/integration/worktree-helper.test.ts"

  if run_test_file "$runtime_dir" "tests/integration/worktree-helper.test.ts" "$out"; then
    local detail="worktree helper integration tests passed for predictable branch/path naming, bounded worktree creation, review-prep inspection, and conservative cleanup blocking."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  else
    local detail="worktree helper integration tests failed."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  fi
}

check_worker_session_integration() {
  local name="6. worker session integration surface"
  local out="$TMP_ROOT/check_worker_session_integration.txt"
  local runtime_dir="$TMP_ROOT/core-workflows-runtime"
  local cmd="cd $runtime_dir && $NODE_BIN --import tsx --test tests/integration/worker-session.test.ts"

  if run_test_file "$runtime_dir" "tests/integration/worker-session.test.ts" "$out"; then
    local detail="worker session integration tests passed for start/status/release, lease metadata, clean cleanup, and dirty-cleanup refusal."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  else
    local detail="worker session integration tests failed."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  fi
}

check_6_scheduled_workflow_integration() {
  local name="6. scheduled workflow integration surface"
  local out="$TMP_ROOT/check_5_scheduled_workflow_integration.txt"
  local runtime_dir="$TMP_ROOT/core-workflows-runtime"
  local cmd="cd $runtime_dir && $NODE_BIN --import tsx --test tests/integration/scheduled-workflows.test.ts"

  if run_test_file "$runtime_dir" "tests/integration/scheduled-workflows.test.ts" "$out"; then
    local detail="scheduled workflow integration tests passed for due/disabled status inspection, explicit materialization, duplicate blocking, and unsupported schedule rejection."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  else
    local detail="scheduled workflow integration tests failed."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  fi
}

check_7_graphify_adapter_integration() {
  local name="7. Graphify adapter fake-binary integration"
  local out="$TMP_ROOT/check_7_graphify_adapter_integration.txt"
  local runtime_dir="$TMP_ROOT/core-workflows-runtime"
  local cmd="cd $runtime_dir && $NODE_BIN --import tsx --test tests/integration/graphify-adapter.test.ts"

  if run_test_file "$runtime_dir" "tests/integration/graphify-adapter.test.ts" "$out"; then
    local detail="Graphify adapter integration test passed with a fake binary, managed artifact output, exclusion arguments, and metadata proof."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  else
    local detail="Graphify adapter fake-binary integration test failed."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  fi
}

check_integrate_worktree_integration() {
  local name="8. integrate-worktree helper integration surface"
  local out="$TMP_ROOT/check_integrate_worktree_integration.txt"
  local runtime_dir="$TMP_ROOT/core-workflows-runtime"
  local cmd="cd $runtime_dir && $NODE_BIN --import tsx --test tests/integration/integrate-worktree.test.ts"

  if run_test_file "$runtime_dir" "tests/integration/integrate-worktree.test.ts" "$out"; then
    local detail="integrate-worktree helper integration tests passed for fast-forward local main integration, tracked-dirt blocking, and allowed generated validation artifacts."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  else
    local detail="integrate-worktree helper integration tests failed."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  fi
}

check_8_pr_gate_integration() {
  local name="8. PR gate helper integration surface"
  local out="$TMP_ROOT/check_8_pr_gate_integration.txt"
  local runtime_dir="$TMP_ROOT/core-workflows-runtime"
  local cmd="cd $runtime_dir && $NODE_BIN --import tsx --test tests/integration/pr-gate.test.ts"

  if run_test_file "$runtime_dir" "tests/integration/pr-gate.test.ts" "$out"; then
    local detail="PR gate helper integration tests passed for no-watch polling, 180-second intervals, terminal pass/fail handling, and comment/review triage."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  else
    local detail="PR gate helper integration tests failed."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  fi
}

check_9_sync_main_integration() {
  local name="9. sync-main helper integration surface"
  local out="$TMP_ROOT/check_9_sync_main_integration.txt"
  local runtime_dir="$TMP_ROOT/core-workflows-runtime"
  local cmd="cd $runtime_dir && $NODE_BIN --import tsx --test tests/integration/sync-main.test.ts"

  if run_test_file "$runtime_dir" "tests/integration/sync-main.test.ts" "$out"; then
    local detail="sync-main helper integration tests passed for fast-forward-only local main sync, ignored runtime bookkeeping preservation, and non-bookkeeping tracked-dirt blocking."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  else
    local detail="sync-main helper integration tests failed."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  fi
}

check_product_pipeline_e2e_validator() {
  local name="9a. product pipeline E2E pilot validator"
  local out="$TMP_ROOT/check_product_pipeline_e2e_validator.txt"
  local report="$TMP_ROOT/product-pipeline-e2e.md"
  local summary="$TMP_ROOT/product-pipeline-e2e.json"
  local cmd="cd $REPO_ROOT && ./scripts/validate-product-pipeline-e2e.sh --report $report --summary-json $summary"

  if (
    cd "$REPO_ROOT" &&
    ./scripts/validate-product-pipeline-e2e.sh --report "$report" --summary-json "$summary" >"$out" 2>&1
  ); then
    local detail="product pipeline E2E pilot passed for checkout-mini success path, HITL visibility, blocked paths, idempotency, reports, and fake-boundary safety."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`\n- summary: $summary"
  else
    local detail="product pipeline E2E pilot validator failed."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  fi
}

check_10_operator_surface_wiring() {
  local name="10. operator/control-plane/queue-session/integrate/worker-session/schedule/worktree/PR-gate/sync-main package/docs wiring"
  local out="$TMP_ROOT/check_10_operator_surface_wiring.txt"
  local cmd="$PYTHON_BIN $TMP_ROOT/check_6_operator_surface_wiring.py"

  cat > "$TMP_ROOT/check_6_operator_surface_wiring.py" <<'PY'
import json
import sys
from pathlib import Path
root = Path(sys.argv[1])
package = json.loads((root / 'package.json').read_text(encoding='utf-8'))
scripts = package.get('scripts', {})
checks = {
    'package.json:harness:operator': 'harness:operator' in scripts,
    'package.json:harness:status': 'harness:status' in scripts,
    'package.json:harness:leases': 'harness:leases' in scripts,
    'package.json:harness:leases:json': 'harness:leases:json' in scripts,
    'package.json:harness:schedules': 'harness:schedules' in scripts,
    'package.json:harness:queue-session': 'harness:queue-session' in scripts,
    'package.json:harness:worktree': 'harness:worktree' in scripts,
    'package.json:harness:integrate': 'harness:integrate' in scripts,
    'package.json:harness:integrate:json': 'harness:integrate:json' in scripts,
    'package.json:harness:worker-session': 'harness:worker-session' in scripts,
    'package.json:harness:worker-session:json': 'harness:worker-session:json' in scripts,
    'package.json:harness:pr-gate': 'harness:pr-gate' in scripts,
    'package.json:harness:sync-main': 'harness:sync-main' in scripts,
    'package.json:harness:slice-lifecycle': 'harness:slice-lifecycle' in scripts,
    'package.json:harness:merge': 'harness:merge' in scripts,
    'package.json:validate:slice-lifecycle': 'validate:slice-lifecycle' in scripts,
    'package.json:validate:merge-helper': 'validate:merge-helper' in scripts,
    'package.json:test:operator-surface': 'test:operator-surface' in scripts,
    'package.json:test:operator-leases': 'test:operator-leases' in scripts,
    'package.json:test:operator-control-plane': 'test:operator-control-plane' in scripts,
    'package.json:test:queue-session': 'test:queue-session' in scripts,
    'package.json:test:scheduled-workflows': 'test:scheduled-workflows' in scripts,
    'package.json:test:worktree-helper': 'test:worktree-helper' in scripts,
    'package.json:test:integrate-worktree': 'test:integrate-worktree' in scripts,
    'package.json:test:worker-session': 'test:worker-session' in scripts,
    'package.json:test:pr-gate': 'test:pr-gate' in scripts,
    'package.json:test:sync-main': 'test:sync-main' in scripts,
    'package.json:test:slice-lifecycle': 'test:slice-lifecycle' in scripts,
    'package.json:test:merge-helper': 'test:merge-helper' in scripts,
    'README.md': 'harness:operator' in (root / 'README.md').read_text(encoding='utf-8') and 'harness:queue-session' in (root / 'README.md').read_text(encoding='utf-8') and 'harness:leases' in (root / 'README.md').read_text(encoding='utf-8') and 'harness:integrate' in (root / 'README.md').read_text(encoding='utf-8') and 'harness:worker-session' in (root / 'README.md').read_text(encoding='utf-8') and 'harness:pr-gate' in (root / 'README.md').read_text(encoding='utf-8') and 'harness:sync-main' in (root / 'README.md').read_text(encoding='utf-8') and 'harness:slice-lifecycle' in (root / 'README.md').read_text(encoding='utf-8') and 'harness:merge' in (root / 'README.md').read_text(encoding='utf-8'),
    '.pi/agent/docs/operator_quickstart.md': 'harness:operator' in (root / '.pi/agent/docs/operator_quickstart.md').read_text(encoding='utf-8') and 'harness:queue-session' in (root / '.pi/agent/docs/operator_quickstart.md').read_text(encoding='utf-8') and 'harness:leases' in (root / '.pi/agent/docs/operator_quickstart.md').read_text(encoding='utf-8') and 'harness:integrate' in (root / '.pi/agent/docs/operator_quickstart.md').read_text(encoding='utf-8') and 'harness:worker-session' in (root / '.pi/agent/docs/operator_quickstart.md').read_text(encoding='utf-8') and 'harness:merge' in (root / '.pi/agent/docs/operator_quickstart.md').read_text(encoding='utf-8'),
    '.pi/agent/docs/operator_workflow.md': 'harness:operator' in (root / '.pi/agent/docs/operator_workflow.md').read_text(encoding='utf-8') and 'harness:queue-session' in (root / '.pi/agent/docs/operator_workflow.md').read_text(encoding='utf-8') and 'harness:leases' in (root / '.pi/agent/docs/operator_workflow.md').read_text(encoding='utf-8') and 'harness:integrate' in (root / '.pi/agent/docs/operator_workflow.md').read_text(encoding='utf-8') and 'harness:worker-session' in (root / '.pi/agent/docs/operator_workflow.md').read_text(encoding='utf-8') and 'harness:pr-gate' in (root / '.pi/agent/docs/operator_workflow.md').read_text(encoding='utf-8') and 'harness:sync-main' in (root / '.pi/agent/docs/operator_workflow.md').read_text(encoding='utf-8') and 'harness:slice-lifecycle' in (root / '.pi/agent/docs/operator_workflow.md').read_text(encoding='utf-8') and 'harness:merge' in (root / '.pi/agent/docs/operator_workflow.md').read_text(encoding='utf-8'),
    '.pi/agent/docs/operator_manual.md': 'harness:operator' in (root / '.pi/agent/docs/operator_manual.md').read_text(encoding='utf-8'),
    '.pi/agent/docs/operator_control_model.md': 'harness:operator' in (root / '.pi/agent/docs/operator_control_model.md').read_text(encoding='utf-8') and 'harness:merge' in (root / '.pi/agent/docs/operator_control_model.md').read_text(encoding='utf-8'),
    '.pi/agent/docs/bounded_autonomy_architecture.md': 'scheduled workflow' in (root / '.pi/agent/docs/bounded_autonomy_architecture.md').read_text(encoding='utf-8').lower(),
    '.pi/agent/docs/validation_architecture.md': 'scheduled workflow' in (root / '.pi/agent/docs/validation_architecture.md').read_text(encoding='utf-8').lower() and 'slice lifecycle' in (root / '.pi/agent/docs/validation_architecture.md').read_text(encoding='utf-8').lower(),
    '.pi/agent/docs/slice_lifecycle.md': 'harness:slice-lifecycle' in (root / '.pi/agent/docs/slice_lifecycle.md').read_text(encoding='utf-8'),
    '.pi/agent/docs/merge_release_policy.md': 'harness:merge' in (root / '.pi/agent/docs/merge_release_policy.md').read_text(encoding='utf-8') and 'merge_ready' in (root / '.pi/agent/docs/merge_release_policy.md').read_text(encoding='utf-8'),
}
missing = [name for name, ok in checks.items() if not ok]
assert not missing, f'missing operator/schedule/worktree wiring in: {missing}'
print('operator-queue-session-schedule-worktree-pr-gate-sync-main-wiring-ok')
PY

  if "$PYTHON_BIN" "$TMP_ROOT/check_6_operator_surface_wiring.py" "$REPO_ROOT" >"$out" 2>&1; then
    local detail="operator wrapper, status, leases, queue-session, integrate, worker-session, scheduled workflow, worktree, PR gate, sync-main, and slice lifecycle helper wiring is present in package scripts, README, and validation/operator docs."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  else
    local detail="operator/control-plane/leases/queue-session/integrate/worker-session/schedule/worktree/PR gate/sync-main package/docs wiring is incomplete."
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
  check_operator_leases_integration
  check_operator_control_plane_integration
  check_slice_lifecycle_integration
  check_merge_helper_integration
  check_4_queue_session_integration
  check_5_worktree_helper_integration
  check_worker_session_integration
  check_6_scheduled_workflow_integration
  check_7_graphify_adapter_integration
  check_integrate_worktree_integration
  check_8_pr_gate_integration
  check_9_sync_main_integration
  check_product_pipeline_e2e_validator
  check_10_operator_surface_wiring

  cat "$SUMMARY_TABLE_FILE" >> "$REPORT_PATH"
  cat >> "$REPORT_PATH" <<EOF

## How to Read This Report
- Scan validator reports in this order:
  1. Summary Table
  2. Final Decision
  3. Detailed Results
- Use Summary Table for the quick pass/fail view across all core workflow surfaces.
- Use Final Decision for the operator-facing verdict, failed-check count, and recommended next step.
- Use Detailed Results only when you need the raw command/evidence for one check.

## Detailed Results
EOF
  cat "$DETAILS_FILE" >> "$REPORT_PATH"
  cat >> "$REPORT_PATH" <<EOF

## Final Decision
- Overall status: $( [[ $FAILED_CHECKS -eq 0 ]] && echo PASS || echo FAIL )
- Failed checks: $FAILED_CHECKS
- Summary JSON: $SUMMARY_JSON_PATH
- Operator Next Step: $( [[ $FAILED_CHECKS -eq 0 ]] && echo "Use this report plus the current coding log as bounded validation evidence; drill into Detailed Results only if you want raw command output." || echo "Start with the Summary Table, then inspect the failing Detailed Results sections before rerunning broader validation." )
EOF
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
