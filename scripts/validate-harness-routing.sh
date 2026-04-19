#!/usr/bin/env bash
set -u -o pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DATE_STAMP="$(date +%F)"
REPORT_DIR="$REPO_ROOT/reports/validation"
DEFAULT_REPORT="$REPORT_DIR/${DATE_STAMP}_harness-routing-validation-script.md"
DEFAULT_SUMMARY_JSON="$REPORT_DIR/${DATE_STAMP}_harness-routing-validation-script.json"

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
# Automated Validation Report — Harness Executable Routing

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
  SUMMARY_NAMES_FILE="$TMP_ROOT/summary_names.txt"
  SUMMARY_STATUS_FILE="$TMP_ROOT/summary_status.txt"
  SUMMARY_DETAILS_FILE="$TMP_ROOT/summary_details.txt"
  : > "$SUMMARY_NAMES_FILE"
  : > "$SUMMARY_STATUS_FILE"
  : > "$SUMMARY_DETAILS_FILE"

  local i
  for i in "${!CHECK_NAMES[@]}"; do
    printf '%s\n' "${CHECK_NAMES[$i]}" >> "$SUMMARY_NAMES_FILE"
    printf '%s\n' "${CHECK_STATUS[$i]}" >> "$SUMMARY_STATUS_FILE"
    printf '%s\n' "${CHECK_DETAILS[$i]}" >> "$SUMMARY_DETAILS_FILE"
  done

  "$PYTHON_BIN" - <<'PY' "$SUMMARY_JSON_PATH" "$SUMMARY_NAMES_FILE" "$SUMMARY_STATUS_FILE" "$SUMMARY_DETAILS_FILE" "$FAILED_CHECKS"
import json, sys
out_path, names_path, statuses_path, details_path, failed = sys.argv[1:]
with open(names_path) as f:
    names = [line.rstrip("\n") for line in f]
with open(statuses_path) as f:
    statuses = [line.rstrip("\n") for line in f]
with open(details_path) as f:
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
  local workdir="$TMP_ROOT/route-runtime"
  mkdir -p "$workdir/src"
  cat > "$workdir/package.json" <<'JSON'
{
  "name": "harness-routing-validator-runtime",
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
  cp "$REPO_ROOT/.pi/agent/extensions/harness-routing.ts" "$workdir/src/harness-routing.ts"
  cp "$REPO_ROOT/.pi/agent/models.json" "$workdir/models.json"
  (cd "$workdir" && npm install --silent >/dev/null 2>&1)
}

probe_unavailable() {
  local file="$1"
  grep -Eq 'No API key found|credit balance is too low|invalid_request_error|No models match pattern|authentication' "$file"
}

check_1_helper_resolution() {
  local name="1. helper-level harness route resolution"
  local out="$TMP_ROOT/check_1_helper_resolution.txt"
  local runtime_dir="$TMP_ROOT/route-runtime"
  local cmd="cd $runtime_dir && npx tsx $TMP_ROOT/check_1_helper_resolution.mts"

  cat > "$TMP_ROOT/check_1_helper_resolution.mts" <<'EOF'
import { readFileSync } from "node:fs";
import { parseHarnessRoutingConfig, resolveHarnessRoute } from "./route-runtime/src/harness-routing.ts";

const config = parseHarnessRoutingConfig(JSON.parse(readFileSync("./models.json", "utf8")));
const cases = [
  {
    name: "planning default",
    input: { role: "planning_lead" },
    expected: { selectedModelId: "openai-codex/gpt-5.4", source: "default" },
  },
  {
    name: "critical role not downgraded",
    input: { role: "orchestrator", reason: "budget_pressure", budgetMode: "conserve" },
    expected: { selectedModelId: "openai-codex/gpt-5.4", source: "default", blockedContains: "blocked from budget_pressure" },
  },
  {
    name: "backend budget override",
    input: { role: "backend_worker", reason: "budget_pressure", budgetMode: "conserve" },
    expected: { selectedModelId: "openai-codex/gpt-5.4-mini", source: "budget_override" },
  },
  {
    name: "frontend harder task stronger override",
    input: { role: "frontend_worker", reason: "task_harder", budgetMode: "high" },
    expected: { selectedModelId: "anthropic/claude-sonnet-4-6", source: "stronger_override" },
  },
  {
    name: "provider failure fallback",
    input: { role: "backend_worker", reason: "provider_failure", failedModels: ["openai-codex/gpt-5.4"] },
    expected: { selectedModelId: "anthropic/claude-sonnet-4-6", source: "fallback" },
  },
  {
    name: "explicit allowed override",
    input: { role: "backend_worker", reason: "human_override", modelOverride: "anthropic/claude-opus-4-5" },
    expected: { selectedModelId: "anthropic/claude-opus-4-5", source: "explicit_override" },
  },
];

const results = cases.map((testCase) => {
  const actual = resolveHarnessRoute(config, testCase.input as never);
  if (actual.selectedModelId !== testCase.expected.selectedModelId) {
    throw new Error(`${testCase.name}: expected selectedModelId=${testCase.expected.selectedModelId} got ${actual.selectedModelId}`);
  }
  if (actual.source !== testCase.expected.source) {
    throw new Error(`${testCase.name}: expected source=${testCase.expected.source} got ${actual.source}`);
  }
  if (testCase.expected.blockedContains) {
    const joined = actual.blockedAdjustments.join("\n");
    if (!joined.includes(testCase.expected.blockedContains)) {
      throw new Error(`${testCase.name}: expected blocked adjustment containing ${testCase.expected.blockedContains}, got ${joined}`);
    }
  }
  return {
    name: testCase.name,
    selectedModelId: actual.selectedModelId,
    source: actual.source,
    blockedAdjustments: actual.blockedAdjustments,
  };
});

console.log(JSON.stringify(results, null, 2));
EOF

  if (cd "$REPO_ROOT" && bash -lc "$cmd") >"$out" 2>&1; then
    local detail="Deterministic helper-level route checks passed."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- helper checks passed for default, do-not-downgrade, budget override, stronger override, fallback, and explicit override\n- sample output:\n\n\`\`\`json\n$(sed -n '1,120p' "$out")\n\`\`\`"
  else
    local detail="Helper-level route checks failed."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`\n$(sed -n '1,160p' "$out")\n\`\`\`"
  fi
}

check_2_compile() {
  local name="2. harness-routing extension TypeScript compile"
  local runtime_dir="$TMP_ROOT/route-runtime"
  local out="$TMP_ROOT/check_2_compile.txt"
  local cmd="cd $runtime_dir && npx tsc --noEmit --skipLibCheck --moduleResolution nodenext --module nodenext --target es2022 --lib es2022,dom --types node src/harness-routing.ts"

  if (cd "$REPO_ROOT" && bash -lc "$cmd") >"$out" 2>&1; then
    local detail="harness-routing.ts compiled successfully."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- compile result: \`PASS\`"
  else
    local detail="harness-routing.ts failed to compile."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- compiler output:\n\n\`\`\`\n$(sed -n '1,160p' "$out")\n\`\`\`"
  fi
}

check_3_live_probe() {
  local name="3. live resolve_harness_route tool probe"
  if [[ $INCLUDE_LIVE -eq 0 ]]; then
    local detail="Live probe skipped by default to avoid unnecessary provider-backed validation spend."
    record_result "$name" "SKIP" "$detail"
    append_summary_row "$name" "SKIP" "$detail"
    append_check_section "$name" "SKIP" "- none" "- run with \`--include-live\` when one bounded live wiring proof is needed"
    return
  fi

  local out="$TMP_ROOT/check_3_live_probe.jsonl"
  local cmd="$PI_BIN --no-session --no-extensions -e $REPO_ROOT/.pi/agent/extensions/harness-routing.ts --mode json \"Use resolve_harness_route for role backend_worker with reason budget_pressure and budgetMode conserve, then report the exact selected model ID in one sentence.\""
  if (cd "$REPO_ROOT" && bash -lc "$cmd") >"$out" 2>&1; then
    if grep -Fq '"toolName":"resolve_harness_route"' "$out" && grep -Fq 'openai-codex/gpt-5.4-mini' "$out"; then
      local detail="Live probe observed resolve_harness_route and the expected selected model ID."
      record_result "$name" "PASS" "$detail"
      append_summary_row "$name" "PASS" "$detail"
      append_check_section "$name" "PASS" "$cmd" "- tool call observed: \`resolve_harness_route\`\n- expected selected model found: \`openai-codex/gpt-5.4-mini\`"
    else
      local detail="Live probe ran but expected tool/result evidence was missing."
      record_result "$name" "FAIL" "$detail"
      append_summary_row "$name" "FAIL" "$detail"
      append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`json\n$(sed -n '1,200p' "$out")\n\`\`\`"
    fi
  elif probe_unavailable "$out"; then
    local detail="Live probe skipped because provider/model access was unavailable in this environment."
    record_result "$name" "SKIP" "$detail"
    append_summary_row "$name" "SKIP" "$detail"
    append_check_section "$name" "SKIP" "$cmd" "- output indicated provider/model unavailability:\n\n\`\`\`\n$(sed -n '1,120p' "$out")\n\`\`\`"
  else
    local detail="Live probe failed unexpectedly."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`\n$(sed -n '1,160p' "$out")\n\`\`\`"
  fi
}

setup_temp_runtime
write_header
check_1_helper_resolution
check_2_compile
check_3_live_probe

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
  echo "Harness-routing validation PASS"
  echo "Report: $REPORT_PATH"
  echo "Summary JSON: $SUMMARY_JSON_PATH"
else
  echo "Harness-routing validation FAIL ($FAILED_CHECKS failed checks)" >&2
  echo "Report: $REPORT_PATH" >&2
  echo "Summary JSON: $SUMMARY_JSON_PATH" >&2
  exit 1
fi
