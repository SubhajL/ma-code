#!/usr/bin/env bash
set -u -o pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DATE_STAMP="$(date +%F)"
REPORT_DIR="$REPO_ROOT/reports/validation"
DEFAULT_REPORT="$REPORT_DIR/${DATE_STAMP}_skill-routing-validation-script.md"
DEFAULT_SUMMARY_JSON="$REPORT_DIR/${DATE_STAMP}_skill-routing-validation-script.json"

PI_BIN="${PI_BIN:-pi}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
KEEP_TEMP=0
SKIP_LIVE=0
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
  --skip-live              Skip provider-backed live Pi probes and run helper/compile checks only
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
    --skip-live)
      SKIP_LIVE=1
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
# Automated Validation Report — Skill Routing

- Date: $DATE_STAMP
- Generated at: $(date '+%Y-%m-%dT%H:%M:%S%z')
- Repo root: $REPO_ROOT
- Pi binary: $PI_BIN
- Python binary: $PYTHON_BIN
- Live probe mode: $( [[ $SKIP_LIVE -eq 1 ]] && echo skipped || echo "repo-default Pi runtime" )
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

assert_contains() {
  local file="$1"
  local expected="$2"
  grep -Fq "$expected" "$file"
}

probe_unavailable() {
  local file="$1"
  grep -Eq 'No API key found|credit balance is too low|invalid_request_error|No models match pattern' "$file"
}

build_skill_args() {
  printf -- '--no-skills --skill %q --skill %q --skill %q --skill %q' \
    "$REPO_ROOT/packages/pi-g-skills/skills/g-planning" \
    "$REPO_ROOT/packages/pi-g-skills/skills/g-coding" \
    "$REPO_ROOT/packages/pi-g-skills/skills/g-check" \
    "$REPO_ROOT/packages/pi-g-skills/skills/g-review"
}

setup_temp_runtime() {
  local workdir="$TMP_ROOT/route-runtime"
  mkdir -p "$workdir/src"
  cat > "$workdir/package.json" <<'JSON'
{
  "name": "skill-routing-validator-runtime",
  "private": true,
  "type": "module",
  "dependencies": {
    "tsx": "^4.20.5",
    "typescript": "^5.9.3",
    "@types/node": "^24.5.2",
    "@mariozechner/pi-coding-agent": "0.67.6"
  }
}
JSON
  cp "$REPO_ROOT/.pi/agent/extensions/g-skill-auto-route.ts" "$workdir/src/g-skill-auto-route.ts"
  (cd "$workdir" && npm install --silent >/dev/null 2>&1)
}

check_1_helper_routes() {
  local name="1. helper-level route classification"
  local out="$TMP_ROOT/check_1_helper_routes.txt"
  local runtime_dir="$TMP_ROOT/route-runtime"
  local cmd="cd $runtime_dir && npx tsx $TMP_ROOT/check_1_helper_routes.mts"

  cat > "$TMP_ROOT/check_1_helper_routes.mts" <<EOF
import { detectSkillRoute, buildSkillCommand } from "./route-runtime/src/g-skill-auto-route.ts";

const cases = [
  { input: "plan a docs-only clarification task", expectedSkill: "g-planning", expectedTransformed: true },
  { input: "implement a docs-only clarification task", expectedSkill: "g-coding", expectedTransformed: true },
  { input: "review changes", expectedSkill: "g-check", expectedTransformed: true },
  { input: "review architecture", expectedSkill: "g-review", expectedTransformed: true },
  { input: "/skill:g-coding implement a docs-only clarification task", expectedSkill: "g-coding", expectedTransformed: false },
  { input: "review", expectedSkill: null, expectedTransformed: null }
];

const results = cases.map((testCase) => {
  const route = detectSkillRoute(testCase.input);
  const actualSkill = route ? route.skill : null;
  const actualTransformed = route ? route.transformed : null;
  if (actualSkill !== testCase.expectedSkill || actualTransformed !== testCase.expectedTransformed) {
    throw new Error(
      "Route mismatch for \"" +
        testCase.input +
        "\": expected skill=" +
        testCase.expectedSkill +
        ", transformed=" +
        testCase.expectedTransformed +
        "; got skill=" +
        actualSkill +
        ", transformed=" +
        actualTransformed,
    );
  }
  return {
    input: testCase.input,
    skill: actualSkill,
    transformed: actualTransformed,
    command: route && route.transformed ? buildSkillCommand(route) : null,
  };
});

console.log(JSON.stringify(results, null, 2));
EOF

  if (cd "$runtime_dir" && npx tsx "$TMP_ROOT/check_1_helper_routes.mts" > "$out" 2>&1); then
    local detail="All required route cases matched expected skill selection, including explicit /skill preservation and bare-review non-match guard."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- helper results written to: $out\n- route cases covered:\n  - planning intent\n  - coding intent\n  - bounded review intent\n  - architecture review intent\n  - explicit /skill:g-coding preservation\n  - bare review non-match guard"
  else
    local detail="Helper-level route classification failed."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- validator output:\n$(cat "$out" 2>/dev/null)"
  fi
}

check_2_compile_extension() {
  local name="2. routing extension TypeScript compile"
  local out="$TMP_ROOT/check_2_compile.txt"
  local runtime_dir="$TMP_ROOT/route-runtime"
  local cmd="cd $runtime_dir && npx tsc --noEmit --skipLibCheck --moduleResolution nodenext --module nodenext --target es2022 --lib es2022,dom --types node src/g-skill-auto-route.ts"

  if (cd "$runtime_dir" && npx tsc --noEmit --skipLibCheck --moduleResolution nodenext --module nodenext --target es2022 --lib es2022,dom --types node src/g-skill-auto-route.ts > "$out" 2>&1); then
    local detail="g-skill-auto-route.ts compiled successfully."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- no TypeScript errors emitted"
  else
    local detail="TypeScript compile check failed for g-skill-auto-route.ts."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- compiler output:\n$(cat "$out" 2>/dev/null)"
  fi
}

run_live_probe() {
  local prompt="$1"
  local out="$2"
  local timeout="$3"
  local skill_args
  skill_args="$(build_skill_args)"
  local cmd="$PI_BIN --tools read,grep,find,ls --no-session --no-extensions -e $REPO_ROOT/.pi/agent/extensions/g-skill-auto-route.ts $skill_args --print \"$prompt\""
  # shellcheck disable=SC2086
  eval "$cmd" > "$out" 2>&1
}

check_3_live_planning() {
  local name="3. live planning route"
  if [[ $SKIP_LIVE -eq 1 ]]; then
    local detail="Live planning probe skipped by option."
    record_result "$name" "SKIP" "$detail"
    append_summary_row "$name" "SKIP" "$detail"
    append_check_section "$name" "SKIP" "- none" "- run without \`--skip-live\` when one bounded live proof is needed"
    return
  fi
  local out="$TMP_ROOT/check_3_live_planning.txt"
  local prompt="plan a docs-only clarification task and return only the required top-level section headers exactly."
  local cmd="$PI_BIN --tools read,grep,find,ls --no-session --no-extensions -e $REPO_ROOT/.pi/agent/extensions/g-skill-auto-route.ts $(build_skill_args) --print \"$prompt\""

  if run_live_probe "$prompt" "$out" 45 \
    && assert_contains "$out" "## Discovery Path" \
    && assert_contains "$out" "## Goal" \
    && assert_contains "$out" "## Non-Goals" \
    && assert_contains "$out" "## Pi Log Update"; then
    local detail="Raw planning prompt routed to g-planning-shaped output."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- observed headers included:\n  - ## Discovery Path\n  - ## Goal\n  - ## Non-Goals\n  - ## Pi Log Update"
  elif probe_unavailable "$out"; then
    local detail="Live planning probe skipped because model/provider access is unavailable in this environment."
    record_result "$name" "SKIP" "$detail"
    append_summary_row "$name" "SKIP" "$detail"
    append_check_section "$name" "SKIP" "$cmd" "- probe output:\n$(cat "$out" 2>/dev/null)"
  else
    local detail="Live planning route probe failed."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- probe output:\n$(cat "$out" 2>/dev/null)"
  fi
}

check_4_live_coding() {
  local name="4. live coding route"
  if [[ $SKIP_LIVE -eq 1 ]]; then
    local detail="Live coding probe skipped by option."
    record_result "$name" "SKIP" "$detail"
    append_summary_row "$name" "SKIP" "$detail"
    append_check_section "$name" "SKIP" "- none" "- run without \`--skip-live\` when one bounded live proof is needed"
    return
  fi
  local out="$TMP_ROOT/check_4_live_coding.txt"
  local prompt="implement a docs-only clarification task and return only the required top-level section headers exactly."
  local cmd="$PI_BIN --tools read,grep,find,ls --no-session --no-extensions -e $REPO_ROOT/.pi/agent/extensions/g-skill-auto-route.ts $(build_skill_args) --print \"$prompt\""

  if run_live_probe "$prompt" "$out" 45 \
    && assert_contains "$out" "## Discovery Path" \
    && assert_contains "$out" "## Goal" \
    && assert_contains "$out" "## TDD Plan" \
    && assert_contains "$out" "## g-check Handoff"; then
    local detail="Raw coding prompt routed to g-coding-shaped output."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- observed headers included:\n  - ## Discovery Path\n  - ## Goal\n  - ## TDD Plan\n  - ## g-check Handoff"
  elif probe_unavailable "$out"; then
    local detail="Live coding probe skipped because model/provider access is unavailable in this environment."
    record_result "$name" "SKIP" "$detail"
    append_summary_row "$name" "SKIP" "$detail"
    append_check_section "$name" "SKIP" "$cmd" "- probe output:\n$(cat "$out" 2>/dev/null)"
  else
    local detail="Live coding route probe failed."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- probe output:\n$(cat "$out" 2>/dev/null)"
  fi
}

check_5_live_review_architecture() {
  local name="5. live architecture review route"
  if [[ $SKIP_LIVE -eq 1 ]]; then
    local detail="Live architecture review probe skipped by option."
    record_result "$name" "SKIP" "$detail"
    append_summary_row "$name" "SKIP" "$detail"
    append_check_section "$name" "SKIP" "- none" "- run without \`--skip-live\` when one bounded live proof is needed"
    return
  fi
  local out="$TMP_ROOT/check_5_live_review_architecture.txt"
  local prompt="review architecture and return only the required top-level section headers exactly."
  local cmd="$PI_BIN --tools read,grep,find,ls --no-session --no-extensions -e $REPO_ROOT/.pi/agent/extensions/g-skill-auto-route.ts $(build_skill_args) --print \"$prompt\""

  if run_live_probe "$prompt" "$out" 45 \
    && assert_contains "$out" "## Discovery Path" \
    && assert_contains "$out" "## Reviewed Scope" \
    && assert_contains "$out" "## As-Is Pipeline Diagram" \
    && assert_contains "$out" "## Pi Log Update"; then
    local detail="Raw architecture review prompt routed to g-review-shaped output."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- observed headers included:\n  - ## Discovery Path\n  - ## Reviewed Scope\n  - ## As-Is Pipeline Diagram\n  - ## Pi Log Update"
  elif probe_unavailable "$out"; then
    local detail="Live architecture review probe skipped because model/provider access is unavailable in this environment."
    record_result "$name" "SKIP" "$detail"
    append_summary_row "$name" "SKIP" "$detail"
    append_check_section "$name" "SKIP" "$cmd" "- probe output:\n$(cat "$out" 2>/dev/null)"
  else
    local detail="Live architecture review route probe failed."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- probe output:\n$(cat "$out" 2>/dev/null)"
  fi
}

check_6_live_explicit_skill() {
  local name="6. live explicit skill preservation"
  if [[ $SKIP_LIVE -eq 1 ]]; then
    local detail="Live explicit skill probe skipped by option."
    record_result "$name" "SKIP" "$detail"
    append_summary_row "$name" "SKIP" "$detail"
    append_check_section "$name" "SKIP" "- none" "- run without \`--skip-live\` when one bounded live proof is needed"
    return
  fi
  local out="$TMP_ROOT/check_6_live_explicit_skill.txt"
  local prompt="/skill:g-coding implement a docs-only clarification task and return only the required top-level section headers exactly."
  local cmd="$PI_BIN --tools read,grep,find,ls --no-session --no-extensions -e $REPO_ROOT/.pi/agent/extensions/g-skill-auto-route.ts $(build_skill_args) --print \"$prompt\""

  if run_live_probe "$prompt" "$out" 45 \
    && assert_contains "$out" "## Discovery Path" \
    && assert_contains "$out" "## TDD Plan" \
    && assert_contains "$out" "## g-check Handoff"; then
    local detail="Explicit /skill:g-coding prompt remained g-coding-shaped under the routing extension."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- observed headers included:\n  - ## Discovery Path\n  - ## TDD Plan\n  - ## g-check Handoff"
  elif probe_unavailable "$out"; then
    local detail="Live explicit /skill probe skipped because model/provider access is unavailable in this environment."
    record_result "$name" "SKIP" "$detail"
    append_summary_row "$name" "SKIP" "$detail"
    append_check_section "$name" "SKIP" "$cmd" "- probe output:\n$(cat "$out" 2>/dev/null)"
  else
    local detail="Live explicit /skill preservation probe failed."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- probe output:\n$(cat "$out" 2>/dev/null)"
  fi
}

finalize_report() {
  cat "$SUMMARY_TABLE_FILE" >> "$REPORT_PATH"
  cat >> "$REPORT_PATH" <<EOF

## Final Decision
- Status: $( [[ $FAILED_CHECKS -eq 0 ]] && echo PASS || echo FAIL )
- Failed checks: $FAILED_CHECKS
EOF
  cat "$DETAILS_FILE" >> "$REPORT_PATH"
}

write_header
setup_temp_runtime
check_1_helper_routes
check_2_compile_extension
check_3_live_planning
check_4_live_coding
check_5_live_review_architecture
check_6_live_explicit_skill
finalize_report
write_json_summary

if [[ $FAILED_CHECKS -eq 0 ]]; then
  echo "Skill-routing validation PASS"
else
  echo "Skill-routing validation FAIL ($FAILED_CHECKS failed checks)" >&2
  exit 1
fi
