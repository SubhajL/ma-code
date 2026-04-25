#!/usr/bin/env bash
set -u -o pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DATE_STAMP="$(date +%F)"
REPORT_DIR="$REPO_ROOT/reports/validation"
DEFAULT_REPORT="$REPORT_DIR/${DATE_STAMP}_task-packets-validation-script.md"
DEFAULT_SUMMARY_JSON="$REPORT_DIR/${DATE_STAMP}_task-packets-validation-script.json"

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
# Automated Validation Report — Task Packets

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
  local workdir="$TMP_ROOT/packet-runtime"
  mkdir -p "$workdir/src" "$workdir/teams" "$workdir/packets" "$workdir/state/schemas"
  cat > "$workdir/package.json" <<'JSON'
{
  "name": "task-packets-validator-runtime",
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
  cp "$REPO_ROOT/.pi/agent/extensions/task-packets.ts" "$workdir/src/task-packets.ts"
  cp "$REPO_ROOT/.pi/agent/extensions/harness-routing.ts" "$workdir/src/harness-routing.ts"
  cp "$REPO_ROOT/.pi/agent/extensions/team-activation.ts" "$workdir/src/team-activation.ts"
  cp "$REPO_ROOT/.pi/agent/packets/packet-policy.json" "$workdir/packets/packet-policy.json"
  cp "$REPO_ROOT/.pi/agent/models.json" "$workdir/models.json"
  cp "$REPO_ROOT/.pi/agent/teams/"*.yaml "$workdir/teams/"
  cp "$REPO_ROOT/.pi/agent/state/schemas/task-packet.schema.json" "$workdir/state/schemas/task-packet.schema.json"
  (cd "$workdir" && npm install --silent >/dev/null 2>&1)
}

probe_unavailable() {
  local file="$1"
  grep -Eq 'No API key found|credit balance is too low|invalid_request_error|No models match pattern|authentication' "$file"
}

check_1_helper_generation() {
  local name="1. helper-level task packet generation"
  local out="$TMP_ROOT/check_1_helper_generation.txt"
  local runtime_dir="$TMP_ROOT/packet-runtime"
  local cmd="cd $runtime_dir && npx tsx $TMP_ROOT/check_1_helper_generation.mts"

  cat > "$TMP_ROOT/check_1_helper_generation.mts" <<'EOF'
import { readFileSync } from "node:fs";
import { parsePacketPolicy, generateTaskPacket, validateTaskPacketShape } from "./packet-runtime/src/task-packets.ts";
import { parseHarnessRoutingConfig } from "./packet-runtime/src/harness-routing.ts";
import { parseTeamDefinition } from "./packet-runtime/src/team-activation.ts";

const policy = parsePacketPolicy(JSON.parse(readFileSync("./packets/packet-policy.json", "utf8")));
const routingConfig = parseHarnessRoutingConfig(JSON.parse(readFileSync("./models.json", "utf8")));
const teams = {
  planning: parseTeamDefinition(readFileSync("./teams/planning.yaml", "utf8"), "planning"),
  build: parseTeamDefinition(readFileSync("./teams/build.yaml", "utf8"), "build"),
  quality: parseTeamDefinition(readFileSync("./teams/quality.yaml", "utf8"), "quality"),
  recovery: parseTeamDefinition(readFileSync("./teams/recovery.yaml", "utf8"), "recovery"),
};

const generated = generateTaskPacket(policy, teams, routingConfig, {
  sourceGoalId: "harness-021",
  parentTaskId: "task-021-build",
  assignedTeam: "build",
  assignedRole: "backend_worker",
  title: "Implement packet generation",
  goal: "Tighten executable task-packet completeness without broad runtime redesign.",
  scope: "Only add deterministic packet generation runtime logic.",
  nonGoals: ["Do not redesign team activation or queue execution."],
  workType: "implementation",
  domains: ["backend"],
  filesToInspect: [".pi/agent/extensions/task-packets.ts", ".pi/agent/state/schemas/task-packet.schema.json"],
  filesToModify: [".pi/agent/extensions/task-packets.ts", ".pi/agent/state/schemas/task-packet.schema.json"],
  allowedPaths: [".pi/agent/extensions/task-packets.ts", ".pi/agent/state/schemas/task-packet.schema.json"],
  acceptanceCriteria: ["generator returns a valid packet", "packet contains explicit planning-completeness sections"],
  expectedProof: ["A focused validator run proves the packet shape and defaults."],
  migrationPathNote: "Not applicable; this packet tightens existing packet structure only.",
  routeReason: "budget_pressure",
  budgetMode: "conserve",
});
validateTaskPacketShape(generated.packet);
if (generated.packet.assignedTeam !== "build") throw new Error("expected build packet");
if (generated.packet.assignedRole !== "backend_worker") throw new Error("expected backend_worker role");
if (generated.packet.modelOverride !== "openai-codex/gpt-5.4-mini") {
  throw new Error(`expected budget override modelOverride openai-codex/gpt-5.4-mini, got ${generated.packet.modelOverride}`);
}
if (!generated.renderedPacket.includes("## Goal")) throw new Error("expected rendered packet goal heading");
if (!generated.renderedPacket.includes("## Files to Inspect")) throw new Error("expected rendered packet inspect heading");
if (!generated.packet.disallowedPaths.includes(".env*")) throw new Error("expected default disallowed paths");
if (generated.packet.filesToModify.length === 0) throw new Error("expected build packet filesToModify");
if (!generated.packet.goal.includes("task-packet completeness")) throw new Error("expected explicit goal text");

const planning = generateTaskPacket(policy, teams, routingConfig, {
  sourceGoalId: "harness-021",
  assignedTeam: "planning",
  assignedRole: "planning_lead",
  title: "Clarify packet shape",
  goal: "Clarify how planning completeness survives into worker-scoped packets.",
  scope: "Inspect packet docs only.",
  nonGoals: ["Do not change queue-runner semantics."],
  workType: "mixed",
  domains: ["research", "docs"],
  filesToInspect: [".pi/agent/docs/team_orchestration_architecture.md"],
  filesToModify: [".pi/agent/docs/team_orchestration_architecture.md"],
  allowedPaths: [".pi/agent/docs/team_orchestration_architecture.md"],
  discoverySummary: ["Read packet architecture docs first."],
  crossModelPlanningNote: "Second model unavailable; main model plan only.",
  acceptanceCriteria: ["packet fields are clarified"],
  expectedProof: ["Documentation diff explicitly names the new packet fields."],
  migrationPathNote: "Not applicable; clarify the existing packet contract in place.",
});
validateTaskPacketShape(planning.packet);
if (planning.packet.modelOverride !== null) throw new Error("expected planning packet to keep default route and null override");
if (!planning.packet.migrationPathNote.includes("Not applicable")) throw new Error("expected explicit migration path note");

let mismatchError = "";
try {
  generateTaskPacket(policy, teams, routingConfig, {
    sourceGoalId: "harness-021",
    assignedTeam: "build",
    assignedRole: "reviewer_worker",
    title: "Bad packet",
    scope: "Should fail.",
    workType: "implementation",
    domains: ["backend"],
    allowedPaths: ["README.md"],
    acceptanceCriteria: ["should not generate"],
  });
} catch (error) {
  mismatchError = String(error);
}
if (!mismatchError.includes("does not belong to team")) {
  throw new Error(`expected role/team mismatch error, got: ${mismatchError}`);
}

let pathError = "";
try {
  generateTaskPacket(policy, teams, routingConfig, {
    sourceGoalId: "harness-021",
    assignedTeam: "build",
    assignedRole: "backend_worker",
    title: "Missing boundaries",
    scope: "Should fail.",
    workType: "implementation",
    acceptanceCriteria: ["should not generate"],
  } as never);
} catch (error) {
  pathError = String(error);
}
if (!pathError.includes("allowed path or domain")) {
  throw new Error(`expected allowed path/domain error, got: ${pathError}`);
}

let completenessError = "";
try {
  validateTaskPacketShape({
    ...generated.packet,
    filesToInspect: [],
  });
} catch (error) {
  completenessError = String(error);
}
if (!completenessError.includes("filesToInspect must not be empty")) {
  throw new Error(`expected filesToInspect completeness error, got: ${completenessError}`);
}

console.log(JSON.stringify({
  buildPacketId: generated.packet.packetId,
  buildModelOverride: generated.packet.modelOverride,
  planningPacketId: planning.packet.packetId,
  renderedHeading: generated.renderedPacket.split("\n")[0],
  mismatchError,
  pathError,
  completenessError,
}, null, 2));
EOF

  if (cd "$REPO_ROOT" && bash -lc "$cmd") >"$out" 2>&1; then
    local detail="Deterministic helper-level task packet generation checks passed."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- helper checks passed for build packet generation, planning packet generation, explicit goal/non-goals/file-plan/expected-proof fields, protected defaults, rendered packet format, role/team mismatch rejection, missing boundary rejection, and completeness-shape rejection\n- sample output:\n\n\`\`\`json\n$(sed -n '1,200p' "$out")\n\`\`\`"
  else
    local detail="Helper-level task packet generation checks failed."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`\n$(sed -n '1,220p' "$out")\n\`\`\`"
  fi
}

check_2_schema_policy() {
  local name="2. task packet schema and policy sanity"
  local out="$TMP_ROOT/check_2_schema_policy.txt"
  local cmd="$PYTHON_BIN - <<'PY'
import json
from pathlib import Path
root = Path(r'$REPO_ROOT')
schema = json.loads((root / '.pi/agent/state/schemas/task-packet.schema.json').read_text())
policy = json.loads((root / '.pi/agent/packets/packet-policy.json').read_text())
required = set(schema['required'])
expected = {
    'version','packetId','source','assignedTeam','assignedRole','title','goal','scope','nonGoals','workType','domains',
    'discoverySummary','crossModelPlanningNote','filesToInspect','filesToModify','allowedPaths','disallowedPaths',
    'acceptanceCriteria','evidenceExpectations','validationExpectations','expectedProof','wiringChecks',
    'migrationPathNote','escalationInstructions','dependencies','modelOverride','routing'
}
missing = sorted(expected - required)
if missing:
    raise SystemExit(f'missing schema required keys: {missing}')
if '.env*' not in policy['defaults']['disallowed_paths']:
    raise SystemExit('packet policy must protect .env* by default')
if not policy['defaults']['non_goals']:
    raise SystemExit('packet policy defaults.non_goals must not be empty')
if not policy['defaults']['files_to_inspect']:
    raise SystemExit('packet policy defaults.files_to_inspect must not be empty')
if not policy['defaults']['expected_proof']:
    raise SystemExit('packet policy defaults.expected_proof must not be empty')
if not policy['defaults']['migration_path_note']:
    raise SystemExit('packet policy defaults.migration_path_note must not be empty')
if not policy['defaults']['evidence_expectations']:
    raise SystemExit('packet policy defaults.evidence_expectations must not be empty')
if set(policy['team_validation_expectations'].keys()) != {'planning','build','quality','recovery'}:
    raise SystemExit('packet policy team_validation_expectations must cover all teams')
print('schema-policy-ok')
PY"
  if bash -lc "$cmd" >"$out" 2>&1; then
    local detail="Schema and packet policy sanity checks passed."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- schema required fields include the bounded HARNESS-044 planning-completeness packet contract\n- packet policy protects default disallowed paths, explicit non-goals/file-plan/proof defaults, and all teams\n- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  else
    local detail="Schema and packet policy sanity checks failed."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`\n$(sed -n '1,200p' "$out")\n\`\`\`"
  fi
}

check_3_compile() {
  local name="3. task-packets extension TypeScript compile"
  local runtime_dir="$TMP_ROOT/packet-runtime"
  local out="$TMP_ROOT/check_3_compile.txt"
  local cmd="cd $runtime_dir && npx tsc --noEmit --allowImportingTsExtensions --skipLibCheck --moduleResolution nodenext --module nodenext --target es2022 --lib es2022,dom --types node src/harness-routing.ts src/team-activation.ts src/task-packets.ts"
  if (cd "$REPO_ROOT" && bash -lc "$cmd") >"$out" 2>&1; then
    local detail="task-packets.ts compiled successfully with its extension dependencies."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- compile result: \`PASS\`"
  else
    local detail="task-packets.ts failed to compile."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- compiler output:\n\n\`\`\`\n$(sed -n '1,220p' "$out")\n\`\`\`"
  fi
}

check_4_live_probe() {
  local name="4. live generate_task_packet tool probe"
  if [[ $INCLUDE_LIVE -eq 0 ]]; then
    local detail="Live probe skipped by default to avoid unnecessary provider-backed validation spend."
    record_result "$name" "SKIP" "$detail"
    append_summary_row "$name" "SKIP" "$detail"
    append_check_section "$name" "SKIP" "- none" "- run with \`--include-live\` when one bounded live wiring proof is needed"
    return
  fi

  local out="$TMP_ROOT/check_4_live_probe.jsonl"
  local cmd="$PI_BIN --no-session --no-extensions -e $REPO_ROOT/.pi/agent/extensions/task-packets.ts -e $REPO_ROOT/.pi/agent/extensions/harness-routing.ts -e $REPO_ROOT/.pi/agent/extensions/team-activation.ts --mode json \"Use generate_task_packet for sourceGoalId harness-021, assignedTeam build, assignedRole backend_worker, title Implement packet generator, scope Only add bounded packet runtime logic, workType implementation, domains [backend], allowedPaths [.pi/agent/extensions/task-packets.ts], and acceptanceCriteria [packet is generated]. Then report the packet ID in one sentence.\""
  if (cd "$REPO_ROOT" && bash -lc "$cmd") >"$out" 2>&1; then
    if grep -Fq '"toolName":"generate_task_packet"' "$out" && grep -Fq 'packet-backend-worker-harness-021' "$out"; then
      local detail="Live probe observed generate_task_packet and the expected packet ID prefix."
      record_result "$name" "PASS" "$detail"
      append_summary_row "$name" "PASS" "$detail"
      append_check_section "$name" "PASS" "$cmd" "- tool call observed: \`generate_task_packet\`\n- expected packet ID prefix found: \`packet-backend-worker-harness-021\`"
    else
      local detail="Live probe ran but expected tool/result evidence was missing."
      record_result "$name" "FAIL" "$detail"
      append_summary_row "$name" "FAIL" "$detail"
      append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`json\n$(sed -n '1,260p' "$out")\n\`\`\`"
    fi
  elif probe_unavailable "$out"; then
    local detail="Live probe skipped because provider/model access was unavailable in this environment."
    record_result "$name" "SKIP" "$detail"
    append_summary_row "$name" "SKIP" "$detail"
    append_check_section "$name" "SKIP" "$cmd" "- output indicated provider/model unavailability:\n\n\`\`\`\n$(sed -n '1,200p' "$out")\n\`\`\`"
  else
    local detail="Live probe failed unexpectedly."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`\n$(sed -n '1,260p' "$out")\n\`\`\`"
  fi
}

setup_temp_runtime
write_header
check_1_helper_generation
check_2_schema_policy
check_3_compile
check_4_live_probe

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
  echo "Task-packets validation PASS"
  echo "Report: $REPORT_PATH"
  echo "Summary JSON: $SUMMARY_JSON_PATH"
else
  echo "Task-packets validation FAIL ($FAILED_CHECKS failed checks)" >&2
  echo "Report: $REPORT_PATH" >&2
  echo "Summary JSON: $SUMMARY_JSON_PATH" >&2
  exit 1
fi
