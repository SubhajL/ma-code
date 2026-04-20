#!/usr/bin/env bash
set -u -o pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DATE_STAMP="$(date +%F)"
REPORT_DIR="$REPO_ROOT/reports/validation"
DEFAULT_REPORT="$REPORT_DIR/${DATE_STAMP}_recovery-policy-validation-script.md"
DEFAULT_SUMMARY_JSON="$REPORT_DIR/${DATE_STAMP}_recovery-policy-validation-script.json"

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

Environment overrides:
  PI_BIN=<path>            Pi executable to use (default: pi)
  PYTHON_BIN=<path>        Python executable to use (default: python3)
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
# Automated Validation Report — Recovery Policy

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
  mkdir -p "$workdir/src"
  cat > "$workdir/package.json" <<'JSON'
{
  "name": "recovery-policy-validator-runtime",
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
  cp "$REPO_ROOT/.pi/agent/extensions/harness-routing.ts" "$workdir/src/harness-routing.ts"
  cp "$REPO_ROOT/.pi/agent/models.json" "$workdir/models.json"
  cp "$REPO_ROOT/.pi/agent/recovery/recovery-policy.json" "$workdir/recovery-policy.json"
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
  local name="1. helper-level recovery policy resolution"
  local out="$TMP_ROOT/check_1_helper_resolution.txt"
  local runtime_dir="$TMP_ROOT/recovery-runtime"
  local cmd="cd $runtime_dir && npx tsx $TMP_ROOT/check_1_helper_resolution.mts"

  cat > "$TMP_ROOT/check_1_helper_resolution.mts" <<'EOF'
import { readFileSync } from "node:fs";
import { parseHarnessRoutingConfig } from "./recovery-runtime/src/harness-routing.ts";
import { parseRecoveryPolicy, resolveRecoveryPolicy } from "./recovery-runtime/src/recovery-policy.ts";

const routingConfig = parseHarnessRoutingConfig(JSON.parse(readFileSync("./models.json", "utf8")));
const policy = parseRecoveryPolicy(JSON.parse(readFileSync("./recovery-policy.json", "utf8")));

const cases = [
  {
    name: "research provider failure prefers stronger same-provider model",
    input: {
      role: "research_worker",
      currentModelId: "openai-codex/gpt-5.4-mini",
      providerFailureState: "model_unavailable",
      retryCounts: { sameLane: 0, strongerModel: 0, providerSwitch: 0, total: 0 },
    },
    expected: {
      failureClass: "provider_failure",
      recommendedAction: "retry_stronger_model",
      strongerModelCandidate: "openai-codex/gpt-5.4",
      escalationRequired: false,
    },
  },
  {
    name: "backend provider failure switches provider when same-provider stronger unavailable",
    input: {
      role: "backend_worker",
      currentModelId: "openai-codex/gpt-5.4",
      providerFailureState: "provider_down",
      retryCounts: { sameLane: 0, strongerModel: 1, providerSwitch: 0, total: 1 },
    },
    expected: {
      failureClass: "provider_failure",
      recommendedAction: "switch_provider",
      providerSwitchCandidate: "anthropic/claude-sonnet-4-6",
      escalationRequired: false,
    },
  },
  {
    name: "ambiguous requirement escalates immediately",
    input: {
      role: "backend_worker",
      requirementsClarity: "ambiguous",
      retryCounts: { sameLane: 0, strongerModel: 0, providerSwitch: 0, total: 0 },
    },
    expected: {
      failureClass: "ambiguity_failure",
      recommendedAction: "escalate",
      escalationRequired: true,
    },
  },
  {
    name: "validation failure allows same-lane retry when budget remains",
    input: {
      role: "backend_worker",
      validationState: "fail",
      evidenceState: "sufficient",
      retryCounts: { sameLane: 0, strongerModel: 0, providerSwitch: 0, total: 0 },
    },
    expected: {
      failureClass: "validation_failure",
      recommendedAction: "retry_same_lane",
      escalationRequired: false,
    },
  },
  {
    name: "provider retry budget exhaustion escalates",
    input: {
      role: "backend_worker",
      currentModelId: "openai-codex/gpt-5.4",
      providerFailureState: "rate_limited",
      retryCounts: { sameLane: 0, strongerModel: 1, providerSwitch: 1, total: 2 },
    },
    expected: {
      failureClass: "provider_failure",
      recommendedAction: "escalate",
      escalationRequired: true,
    },
  },
];

const results = cases.map(({ name, input, expected }) => {
  const resolved = resolveRecoveryPolicy(policy, routingConfig, input as any);
  const summary = {
    name,
    failureClass: resolved.failureClass,
    recommendedAction: resolved.recommendedAction,
    strongerModelCandidate: resolved.retryEligibility.retry_stronger_model.nextModelId,
    providerSwitchCandidate: resolved.retryEligibility.switch_provider.nextModelId,
    escalationRequired: resolved.escalation.required,
  };
  for (const [key, value] of Object.entries(expected)) {
    if ((summary as Record<string, unknown>)[key] !== value) {
      throw new Error(`${name}: expected ${key}=${JSON.stringify(value)}, got ${JSON.stringify((summary as Record<string, unknown>)[key])}`);
    }
  }
  return summary;
});

console.log(JSON.stringify(results, null, 2));
EOF

  if (cd "$runtime_dir" && npx tsx "$TMP_ROOT/check_1_helper_resolution.mts" >"$out" 2>&1); then
    local detail="Deterministic helper-level recovery classification and retry eligibility checks passed."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- helper checks passed for provider-failure, ambiguity, validation-failure, and budget-exhaustion cases\n- sample output:\n\n\`\`\`json\n$(cat "$out")\n\`\`\`"
  else
    local detail="Recovery helper-level behavior did not match the expected bounded policy outcomes."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  fi
}

check_2_extension_compile() {
  local name="2. recovery-policy extension TypeScript compile"
  local out="$TMP_ROOT/check_2_extension_compile.txt"
  local runtime_dir="$TMP_ROOT/recovery-runtime"
  local cmd="cd $runtime_dir && npx tsc --noEmit --skipLibCheck --allowImportingTsExtensions --moduleResolution nodenext --module nodenext --target es2022 --lib es2022,dom --types node src/harness-routing.ts src/recovery-policy.ts"

  if (
    cd "$runtime_dir" &&
    npx tsc --noEmit --skipLibCheck --allowImportingTsExtensions --moduleResolution nodenext --module nodenext --target es2022 --lib es2022,dom --types node src/harness-routing.ts src/recovery-policy.ts >"$out" 2>&1
  ); then
    local detail="recovery-policy.ts compiled successfully."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- compile result: \`PASS\`"
  else
    local detail="recovery-policy.ts did not compile successfully."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  fi
}

check_3_live_tool_probe() {
  local name="3. live resolve_recovery_policy tool probe"
  local out="$TMP_ROOT/check_3_live_tool_probe.jsonl"

  if [[ $INCLUDE_LIVE -eq 0 ]]; then
    local detail="Live probe skipped by default to avoid unnecessary provider-backed validation spend."
    record_result "$name" "SKIP" "$detail"
    append_summary_row "$name" "SKIP" "$detail"
    append_check_section "$name" "SKIP" "- none" "- run with \`--include-live\` when one bounded live wiring proof is needed"
    return
  fi

  local cmd="$PI_BIN --mode json --no-session --no-extensions -e $REPO_ROOT/.pi/agent/extensions/recovery-policy.ts -e $REPO_ROOT/.pi/agent/extensions/harness-routing.ts \"Use resolve_recovery_policy for role research_worker with currentModelId openai-codex/gpt-5.4-mini, providerFailureState model_unavailable, and retryCounts sameLane 0 strongerModel 0 providerSwitch 0 total 0. Report the exact recommended action and stronger-model candidate in one sentence.\""

  if (
    cd "$REPO_ROOT" &&
    eval "$cmd" >"$out" 2>&1
  ); then
    if grep -Fq 'retry_stronger_model' "$out" && grep -Fq 'openai-codex/gpt-5.4' "$out"; then
      local detail="Live tool probe observed the expected recovery-policy recommendation and candidate model."
      record_result "$name" "PASS" "$detail"
      append_summary_row "$name" "PASS" "$detail"
      append_check_section "$name" "PASS" "$cmd" "- output:\n\n\`\`\`json\n$(sed -n '1,200p' "$out")\n\`\`\`"
      return
    fi
  fi

  if probe_unavailable "$out"; then
    local detail="Live probe could not run because provider/model access was unavailable in this environment; treated as SKIP."
    record_result "$name" "SKIP" "$detail"
    append_summary_row "$name" "SKIP" "$detail"
    append_check_section "$name" "SKIP" "$cmd" "- output:\n\n\`\`\`\n$(sed -n '1,120p' "$out")\n\`\`\`"
  else
    local detail="Live recovery-policy tool probe did not show the expected recommendation."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`\n$(sed -n '1,200p' "$out")\n\`\`\`"
  fi
}

setup_temp_runtime
write_header
check_1_helper_resolution
check_2_extension_compile
check_3_live_tool_probe

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
  echo "Recovery-policy validation PASS"
  echo "Report: $REPORT_PATH"
  echo "Summary JSON: $SUMMARY_JSON_PATH"
  exit 0
else
  echo "Recovery-policy validation FAIL"
  echo "Report: $REPORT_PATH"
  echo "Summary JSON: $SUMMARY_JSON_PATH"
  exit 1
fi
