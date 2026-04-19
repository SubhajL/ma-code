#!/usr/bin/env bash
set -u -o pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DATE_STAMP="$(date +%F)"
REPORT_DIR="$REPO_ROOT/reports/validation"
DEFAULT_REPORT="$REPORT_DIR/${DATE_STAMP}_team-activation-validation-script.md"
DEFAULT_SUMMARY_JSON="$REPORT_DIR/${DATE_STAMP}_team-activation-validation-script.json"

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
# Automated Validation Report — Team Activation

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
  local workdir="$TMP_ROOT/activation-runtime"
  mkdir -p "$workdir/src" "$workdir/teams"
  cat > "$workdir/package.json" <<'JSON'
{
  "name": "team-activation-validator-runtime",
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
  cp "$REPO_ROOT/.pi/agent/extensions/team-activation.ts" "$workdir/src/team-activation.ts"
  cp "$REPO_ROOT/.pi/agent/teams/activation-policy.json" "$workdir/activation-policy.json"
  cp "$REPO_ROOT/.pi/agent/teams/"*.yaml "$workdir/teams/"
  (cd "$workdir" && npm install --silent >/dev/null 2>&1)
}

probe_unavailable() {
  local file="$1"
  grep -Eq 'No API key found|credit balance is too low|invalid_request_error|No models match pattern|authentication' "$file"
}

check_1_helper_resolution() {
  local name="1. helper-level team activation resolution"
  local out="$TMP_ROOT/check_1_helper_resolution.txt"
  local runtime_dir="$TMP_ROOT/activation-runtime"
  local cmd="cd $runtime_dir && npx tsx $TMP_ROOT/check_1_helper_resolution.mts"

  cat > "$TMP_ROOT/check_1_helper_resolution.mts" <<'EOF'
import { readFileSync } from "node:fs";
import { parseActivationPolicy, parseTeamDefinition, resolveTeamActivation } from "./activation-runtime/src/team-activation.ts";

const policy = parseActivationPolicy(JSON.parse(readFileSync("./activation-policy.json", "utf8")));
const teams = {
  planning: parseTeamDefinition(readFileSync("./teams/planning.yaml", "utf8"), "planning"),
  build: parseTeamDefinition(readFileSync("./teams/build.yaml", "utf8"), "build"),
  quality: parseTeamDefinition(readFileSync("./teams/quality.yaml", "utf8"), "quality"),
  recovery: parseTeamDefinition(readFileSync("./teams/recovery.yaml", "utf8"), "recovery"),
};

const cases = [
  {
    name: "planning-first ambiguity",
    input: {
      workType: "mixed",
      requirementsClarity: "ambiguous",
      scopeClarity: "unclear",
      acceptanceCriteria: "missing",
      repoImpact: "unclear",
      domains: ["backend", "infra"],
    },
    expected: {
      initialTeam: "planning",
      sequence: ["planning"],
      qualityMode: "none",
    },
  },
  {
    name: "build-first bounded implementation",
    input: {
      workType: "implementation",
      requirementsClarity: "clear",
      scopeClarity: "bounded",
      acceptanceCriteria: "explicit",
      repoImpact: "known",
      domains: ["backend"],
    },
    expected: {
      initialTeam: "build",
      sequence: ["build", "quality"],
      qualityMode: "full",
    },
  },
  {
    name: "docs-only light quality",
    input: {
      workType: "docs_only",
      requirementsClarity: "clear",
      scopeClarity: "bounded",
      acceptanceCriteria: "explicit",
      repoImpact: "known",
      validationState: "needed",
      domains: ["docs"],
    },
    expected: {
      initialTeam: "quality",
      sequence: ["quality"],
      qualityMode: "light",
    },
  },
  {
    name: "recovery stops normal flow",
    input: {
      workType: "implementation",
      requirementsClarity: "clear",
      scopeClarity: "bounded",
      acceptanceCriteria: "explicit",
      repoImpact: "known",
      validationState: "contradictory",
      domains: ["backend"],
    },
    expected: {
      initialTeam: "recovery",
      sequence: ["recovery"],
      qualityMode: "none",
    },
  },
  {
    name: "planning-build overlap allowed for stable multi-domain work",
    input: {
      workType: "mixed",
      requirementsClarity: "clear",
      scopeClarity: "bounded",
      acceptanceCriteria: "explicit",
      repoImpact: "known",
      domains: ["backend", "infra"],
    },
    expected: {
      initialTeam: "planning",
      sequence: ["planning", "build", "quality"],
      planningBuildAllowed: true,
    },
  },
  {
    name: "multiple build workers blocked without non-overlap or isolation",
    input: {
      workType: "implementation",
      requirementsClarity: "clear",
      scopeClarity: "bounded",
      acceptanceCriteria: "explicit",
      repoImpact: "known",
      domains: ["frontend"],
      buildParallelism: "multiple",
      buildFilesOverlap: "possible",
      worktreeIsolation: "unavailable",
    },
    expected: {
      initialTeam: "build",
      sequence: ["build", "quality"],
      multipleBuildWorkersAllowed: false,
    },
  },
];

const results = cases.map((testCase) => {
  const actual = resolveTeamActivation(policy, teams, testCase.input as never);
  if (actual.initialTeam !== testCase.expected.initialTeam) {
    throw new Error(`${testCase.name}: expected initialTeam=${testCase.expected.initialTeam} got ${actual.initialTeam}`);
  }
  if (JSON.stringify(actual.sequence) !== JSON.stringify(testCase.expected.sequence)) {
    throw new Error(`${testCase.name}: expected sequence=${JSON.stringify(testCase.expected.sequence)} got ${JSON.stringify(actual.sequence)}`);
  }
  if ("qualityMode" in testCase.expected && actual.qualityMode !== testCase.expected.qualityMode) {
    throw new Error(`${testCase.name}: expected qualityMode=${testCase.expected.qualityMode} got ${actual.qualityMode}`);
  }
  if ("planningBuildAllowed" in testCase.expected && actual.overlapDecisions.planningBuild.allowed !== testCase.expected.planningBuildAllowed) {
    throw new Error(`${testCase.name}: expected planningBuild.allowed=${testCase.expected.planningBuildAllowed} got ${actual.overlapDecisions.planningBuild.allowed}`);
  }
  if ("multipleBuildWorkersAllowed" in testCase.expected && actual.overlapDecisions.multipleBuildWorkers.allowed !== testCase.expected.multipleBuildWorkersAllowed) {
    throw new Error(`${testCase.name}: expected multipleBuildWorkers.allowed=${testCase.expected.multipleBuildWorkersAllowed} got ${actual.overlapDecisions.multipleBuildWorkers.allowed}`);
  }
  return {
    name: testCase.name,
    initialTeam: actual.initialTeam,
    sequence: actual.sequence,
    qualityMode: actual.qualityMode,
    overlapDecisions: actual.overlapDecisions,
  };
});

console.log(JSON.stringify(results, null, 2));
EOF

  if (cd "$REPO_ROOT" && bash -lc "$cmd") >"$out" 2>&1; then
    local detail="Deterministic helper-level team activation checks passed."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- helper checks passed for planning-first, build-first, light-quality, recovery, overlap-allowed, and overlap-blocked cases\n- sample output:\n\n\`\`\`json\n$(sed -n '1,140p' "$out")\n\`\`\`"
  else
    local detail="Helper-level team activation checks failed."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`\n$(sed -n '1,200p' "$out")\n\`\`\`"
  fi
}

check_2_compile() {
  local name="2. team-activation extension TypeScript compile"
  local runtime_dir="$TMP_ROOT/activation-runtime"
  local out="$TMP_ROOT/check_2_compile.txt"
  local cmd="cd $runtime_dir && npx tsc --noEmit --skipLibCheck --moduleResolution nodenext --module nodenext --target es2022 --lib es2022,dom --types node src/team-activation.ts"

  if (cd "$REPO_ROOT" && bash -lc "$cmd") >"$out" 2>&1; then
    local detail="team-activation.ts compiled successfully."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- compile result: \`PASS\`"
  else
    local detail="team-activation.ts failed to compile."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- compiler output:\n\n\`\`\`\n$(sed -n '1,200p' "$out")\n\`\`\`"
  fi
}

check_3_live_probe() {
  local name="3. live resolve_team_activation tool probe"
  if [[ $INCLUDE_LIVE -eq 0 ]]; then
    local detail="Live probe skipped by default to avoid unnecessary provider-backed validation spend."
    record_result "$name" "SKIP" "$detail"
    append_summary_row "$name" "SKIP" "$detail"
    append_check_section "$name" "SKIP" "- none" "- run with \`--include-live\` when one bounded live wiring proof is needed"
    return
  fi

  local out="$TMP_ROOT/check_3_live_probe.jsonl"
  local cmd="$PI_BIN --no-session --no-extensions -e $REPO_ROOT/.pi/agent/extensions/team-activation.ts --mode json \"Use resolve_team_activation for implementation work with clear requirements, bounded scope, explicit acceptance criteria, known repo impact, and only backend domain. Then report the first selected team in one sentence.\""

  if (cd "$REPO_ROOT" && bash -lc "$cmd") >"$out" 2>&1; then
    if grep -Fq '"toolName":"resolve_team_activation"' "$out" && grep -Fq '"initialTeam":"build"' "$out"; then
      local detail="Live probe observed resolve_team_activation and the expected initial team."
      record_result "$name" "PASS" "$detail"
      append_summary_row "$name" "PASS" "$detail"
      append_check_section "$name" "PASS" "$cmd" "- tool call observed: \`resolve_team_activation\`\n- expected initial team found: \`build\`"
    else
      local detail="Live probe ran but expected tool/result evidence was missing."
      record_result "$name" "FAIL" "$detail"
      append_summary_row "$name" "FAIL" "$detail"
      append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`json\n$(sed -n '1,220p' "$out")\n\`\`\`"
    fi
  elif probe_unavailable "$out"; then
    local detail="Live probe skipped because provider/model access was unavailable in this environment."
    record_result "$name" "SKIP" "$detail"
    append_summary_row "$name" "SKIP" "$detail"
    append_check_section "$name" "SKIP" "$cmd" "- output indicated provider/model unavailability:\n\n\`\`\`\n$(sed -n '1,160p' "$out")\n\`\`\`"
  else
    local detail="Live probe failed unexpectedly."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`\n$(sed -n '1,220p' "$out")\n\`\`\`"
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
  echo "Team-activation validation PASS"
  echo "Report: $REPORT_PATH"
  echo "Summary JSON: $SUMMARY_JSON_PATH"
else
  echo "Team-activation validation FAIL ($FAILED_CHECKS failed checks)" >&2
  echo "Report: $REPORT_PATH" >&2
  echo "Summary JSON: $SUMMARY_JSON_PATH" >&2
  exit 1
fi
