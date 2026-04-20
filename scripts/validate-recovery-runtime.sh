#!/usr/bin/env bash
set -u -o pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DATE_STAMP="$(date +%F)"
REPORT_DIR="$REPO_ROOT/reports/validation"
DEFAULT_REPORT="$REPORT_DIR/${DATE_STAMP}_recovery-runtime-validation-script.md"
DEFAULT_SUMMARY_JSON="$REPORT_DIR/${DATE_STAMP}_recovery-runtime-validation-script.json"

PI_BIN="${PI_BIN:-pi}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
KEEP_TEMP=0
INCLUDE_LIVE=0
REPORT_PATH="$DEFAULT_REPORT"
SUMMARY_JSON_PATH="$DEFAULT_SUMMARY_JSON"
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
  --include-live           Run one bounded live tool probe
  --keep-temp              Keep temporary validation directories and files
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
# Automated Validation Report — Recovery Runtime

- Date: $DATE_STAMP
- Generated at: $(date '+%Y-%m-%dT%H:%M:%S%z')
- Repo root: $REPO_ROOT
- Pi binary: $PI_BIN
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
  local workdir="$TMP_ROOT/recovery-runtime"
  mkdir -p "$workdir/src" "$workdir/.pi/agent/recovery" "$workdir/.pi/agent/state/runtime"
  cat > "$workdir/package.json" <<'JSON'
{
  "name": "recovery-runtime-validator",
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
  cp "$REPO_ROOT/.pi/agent/extensions/recovery-policy.ts" "$workdir/src/recovery-policy.ts"
  cp "$REPO_ROOT/.pi/agent/extensions/recovery-runtime.ts" "$workdir/src/recovery-runtime.ts"
  cp "$REPO_ROOT/.pi/agent/extensions/harness-routing.ts" "$workdir/src/harness-routing.ts"
  cp "$REPO_ROOT/.pi/agent/models.json" "$workdir/.pi/agent/models.json"
  cp "$REPO_ROOT/.pi/agent/recovery/recovery-policy.json" "$workdir/.pi/agent/recovery/recovery-policy.json"
  cat > "$workdir/.pi/agent/state/runtime/tasks.json" <<'JSON'
{
  "version": 1,
  "activeTaskId": null,
  "tasks": [
    {
      "id": "task-from-state",
      "title": "State-backed retry evidence",
      "owner": "assistant",
      "status": "failed",
      "taskClass": "implementation",
      "acceptance": ["Fix the validator"],
      "evidence": ["reports/validation/failure.md"],
      "dependencies": [],
      "retryCount": 1,
      "validation": {
        "tier": "standard",
        "decision": "fail",
        "source": "validator",
        "checklist": {
          "acceptance": "partial",
          "tests": "met",
          "diff_review": "met",
          "evidence": "met"
        },
        "approvalRef": null,
        "updatedAt": "2026-04-20T00:00:00.000Z"
      },
      "notes": ["validator rejected the previous retry"],
      "timestamps": {
        "createdAt": "2026-04-20T00:00:00.000Z",
        "updatedAt": "2026-04-20T00:05:00.000Z"
      }
    }
  ]
}
JSON
  (
    cd "$workdir"
    npm install --silent >/dev/null 2>&1
  )
}

probe_unavailable() {
  local file="$1"
  grep -Eq 'No API key found|credit balance is too low|invalid_request_error|No models match pattern|authentication' "$file"
}

check_1_helper_resolution() {
  local name="1. helper-level recovery runtime resolution"
  local out="$TMP_ROOT/check_1_helper_resolution.txt"
  local runtime_dir="$TMP_ROOT/recovery-runtime"
  local cmd="cd $runtime_dir && npx tsx $TMP_ROOT/check_1_helper_resolution.mts"

  cat > "$TMP_ROOT/check_1_helper_resolution.mts" <<'EOF'
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseHarnessRoutingConfig } from "./recovery-runtime/src/harness-routing.ts";
import { parseRecoveryPolicy } from "./recovery-runtime/src/recovery-policy.ts";
import { resolveRecoveryRuntimeDecision } from "./recovery-runtime/src/recovery-runtime.ts";

const routingConfig = parseHarnessRoutingConfig(JSON.parse(readFileSync("./.pi/agent/models.json", "utf8")));
const policy = parseRecoveryPolicy(JSON.parse(readFileSync("./.pi/agent/recovery/recovery-policy.json", "utf8")));

const cases = [
  {
    name: "first validation failure retries same lane",
    input: {
      role: "backend_worker",
      currentModelId: "openai-codex/gpt-5.4",
      task: {
        id: "task-first-retry",
        title: "Fix failing validator",
        status: "failed",
        taskClass: "implementation",
        retryCount: 0,
        evidence: ["reports/validation/failure.md"],
        notes: [],
        validation: { decision: "fail" }
      }
    },
    expected: {
      recommendedAction: "retry_same_lane",
      rollback: false,
      haltAutonomy: false
    }
  },
  {
    name: "repeated validation failure rolls back bounded lane",
    input: {
      role: "backend_worker",
      currentModelId: "openai-codex/gpt-5.4",
      task: {
        id: "task-repeat-failure",
        title: "Fix failing validator again",
        status: "failed",
        taskClass: "implementation",
        retryCount: 1,
        evidence: ["reports/validation/failure.md"],
        notes: ["validator rejected previous retry"],
        validation: { decision: "fail" }
      }
    },
    expected: {
      recommendedAction: "rollback",
      rollbackScope: "current_task_lane",
      haltAutonomy: true
    }
  },
  {
    name: "validator role uses stricter role-specific retry rules",
    input: {
      role: "validator_worker",
      currentModelId: "openai-codex/gpt-5.4",
      task: {
        id: "task-validator",
        title: "Validator follow-up",
        status: "failed",
        taskClass: "runtime_safety",
        retryCount: 0,
        evidence: ["reports/validation/runtime.md"],
        notes: [],
        validation: { decision: "fail" }
      }
    },
    expected: {
      recommendedAction: "retry_stronger_model",
      nextModelId: "anthropic/claude-opus-4-5"
    }
  },
  {
    name: "provider-specific budget can force provider switch",
    input: {
      role: "research_worker",
      currentModelId: "openai-codex/gpt-5.4-mini",
      providerFailureState: "model_unavailable",
      providerRetryCounts: {
        "openai-codex": 1
      }
    },
    expected: {
      recommendedAction: "switch_provider",
      nextProvider: "anthropic"
    }
  }
];

for (const testCase of cases) {
  const result = resolveRecoveryRuntimeDecision(policy, routingConfig, testCase.input);
  assert.equal(result.recommendedAction, testCase.expected.recommendedAction, `${testCase.name}: recommended action`);
  if ("rollback" in testCase.expected) {
    assert.equal(result.rollback.recommended, testCase.expected.rollback, `${testCase.name}: rollback`);
  }
  if ("rollbackScope" in testCase.expected) {
    assert.equal(result.rollback.scope, testCase.expected.rollbackScope, `${testCase.name}: rollback scope`);
  }
  if ("haltAutonomy" in testCase.expected) {
    assert.equal(result.haltAutonomy, testCase.expected.haltAutonomy, `${testCase.name}: halt autonomy`);
  }
  if ("nextModelId" in testCase.expected) {
    assert.equal(result.retryPlan.nextModelId, testCase.expected.nextModelId, `${testCase.name}: next model`);
  }
  if ("nextProvider" in testCase.expected) {
    assert.equal(result.retryPlan.nextProvider, testCase.expected.nextProvider, `${testCase.name}: next provider`);
  }
}

const fromState = resolveRecoveryRuntimeDecision(policy, routingConfig, {
  role: "backend_worker",
  currentModelId: "openai-codex/gpt-5.4",
  task: JSON.parse(readFileSync("./.pi/agent/state/runtime/tasks.json", "utf8")).tasks[0],
});
assert.equal(fromState.recommendedAction, "rollback");
assert.equal(fromState.taskContext?.retryCount, 1);
console.log(JSON.stringify({ ok: true, cases: cases.length + 1 }, null, 2));
EOF

  if (cd "$runtime_dir" && npx tsx "$TMP_ROOT/check_1_helper_resolution.mts" >"$out" 2>&1); then
    local detail="Deterministic runtime decision helper checks passed, including task-state-derived evidence."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- helper checks passed for retry, rollback, role-specific limits, provider-specific limits, and task-state reuse\n- sample output:\n\n\`\`\`json\n$(sed -n '1,120p' "$out")\n\`\`\`"
  else
    local detail="Runtime decision helper checks failed."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- helper-level runtime decision assertions failed\n\n\`\`\`\n$(sed -n '1,200p' "$out")\n\`\`\`"
  fi
}

check_2_extension_compile() {
  local name="2. recovery-runtime extension TypeScript compile"
  local out="$TMP_ROOT/check_2_extension_compile.txt"
  local runtime_dir="$TMP_ROOT/recovery-runtime"
  local cmd="cd $runtime_dir && npx tsc --noEmit --skipLibCheck --allowImportingTsExtensions --moduleResolution nodenext --module nodenext --target es2022 --lib es2022,dom --types node src/harness-routing.ts src/recovery-policy.ts src/recovery-runtime.ts"

  if (
    cd "$runtime_dir" \
    && npx tsc --noEmit --skipLibCheck --allowImportingTsExtensions --moduleResolution nodenext --module nodenext --target es2022 --lib es2022,dom --types node src/harness-routing.ts src/recovery-policy.ts src/recovery-runtime.ts >"$out" 2>&1
  ); then
    local detail="recovery-runtime.ts compiled successfully."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- compile output was clean"
  else
    local detail="recovery-runtime.ts did not compile successfully."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- compile output:\n\n\`\`\`\n$(sed -n '1,200p' "$out")\n\`\`\`"
  fi
}

check_3_live_tool_probe() {
  local name="3. live resolve_recovery_runtime_decision tool probe"
  local out="$TMP_ROOT/check_3_live_tool_probe.jsonl"
  local cmd="$PI_BIN --mode json --no-session --no-extensions -e $REPO_ROOT/.pi/agent/extensions/recovery-policy.ts -e $REPO_ROOT/.pi/agent/extensions/recovery-runtime.ts -e $REPO_ROOT/.pi/agent/extensions/harness-routing.ts \"Use resolve_recovery_runtime_decision for role backend_worker with currentModelId openai-codex/gpt-5.4, approvalRequired true, and a failed implementation task with retryCount 0, validation fail, and evidence path reports/validation/failure.md. Report the exact recommended action and whether autonomy should halt in one sentence.\""

  if [[ $INCLUDE_LIVE -eq 0 ]]; then
    local detail="Live probe skipped by default to avoid unnecessary provider-backed validation spend."
    record_result "$name" "SKIP" "$detail"
    append_summary_row "$name" "SKIP" "$detail"
    append_check_section "$name" "SKIP" "$cmd" "- skipped intentionally unless --include-live is provided"
    return
  fi

  if eval "$cmd" >"$out" 2>&1; then
    if grep -Eq 'stop' "$out" && grep -Eq 'halt' "$out"; then
      local detail="Live tool probe observed the expected stop recommendation."
      record_result "$name" "PASS" "$detail"
      append_summary_row "$name" "PASS" "$detail"
      append_check_section "$name" "PASS" "$cmd" "- live output contained the expected stop recommendation\n\n\`\`\`json\n$(sed -n '1,200p' "$out")\n\`\`\`"
    else
      local detail="Live recovery-runtime tool probe did not show the expected recommendation."
      record_result "$name" "FAIL" "$detail"
      append_summary_row "$name" "FAIL" "$detail"
      append_check_section "$name" "FAIL" "$cmd" "- live output was missing the expected stop recommendation\n\n\`\`\`json\n$(sed -n '1,200p' "$out")\n\`\`\`"
    fi
  else
    if probe_unavailable "$out"; then
      local detail="Live probe skipped because provider-backed validation was unavailable."
      record_result "$name" "SKIP" "$detail"
      append_summary_row "$name" "SKIP" "$detail"
      append_check_section "$name" "SKIP" "$cmd" "- provider-backed validation unavailable\n\n\`\`\`\n$(sed -n '1,160p' "$out")\n\`\`\`"
    else
      local detail="Live tool probe command failed."
      record_result "$name" "FAIL" "$detail"
      append_summary_row "$name" "FAIL" "$detail"
      append_check_section "$name" "FAIL" "$cmd" "- command failed\n\n\`\`\`\n$(sed -n '1,160p' "$out")\n\`\`\`"
    fi
  fi
}

write_header
setup_temp_runtime
check_1_helper_resolution
check_2_extension_compile
check_3_live_tool_probe
cat "$SUMMARY_TABLE_FILE" >> "$REPORT_PATH"
printf '\n' >> "$REPORT_PATH"
cat "$DETAILS_FILE" >> "$REPORT_PATH"
write_json_summary

if [[ $FAILED_CHECKS -eq 0 ]]; then
  echo "Recovery-runtime validation PASS"
else
  echo "Recovery-runtime validation FAIL" >&2
  echo "Report: $REPORT_PATH" >&2
  echo "Summary JSON: $SUMMARY_JSON_PATH" >&2
  exit 1
fi
