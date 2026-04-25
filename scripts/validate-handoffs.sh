#!/usr/bin/env bash
set -u -o pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DATE_STAMP="$(date +%F)"
REPORT_DIR="$REPO_ROOT/reports/validation"
DEFAULT_REPORT="$REPORT_DIR/${DATE_STAMP}_handoffs-validation-script.md"
DEFAULT_SUMMARY_JSON="$REPORT_DIR/${DATE_STAMP}_handoffs-validation-script.json"

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
# Automated Validation Report — Handoffs

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
  local workdir="$TMP_ROOT/handoff-runtime"
  mkdir -p "$workdir/src" "$workdir/teams" "$workdir/packets" "$workdir/handoffs" "$workdir/state/schemas"
  cat > "$workdir/package.json" <<'JSON'
{
  "name": "handoffs-validator-runtime",
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
  cp "$REPO_ROOT/.pi/agent/extensions/handoffs.ts" "$workdir/src/handoffs.ts"
  cp "$REPO_ROOT/.pi/agent/extensions/task-packets.ts" "$workdir/src/task-packets.ts"
  cp "$REPO_ROOT/.pi/agent/extensions/harness-routing.ts" "$workdir/src/harness-routing.ts"
  cp "$REPO_ROOT/.pi/agent/extensions/team-activation.ts" "$workdir/src/team-activation.ts"
  cp "$REPO_ROOT/.pi/agent/handoffs/handoff-policy.json" "$workdir/handoffs/handoff-policy.json"
  cp "$REPO_ROOT/.pi/agent/packets/packet-policy.json" "$workdir/packets/packet-policy.json"
  cp "$REPO_ROOT/.pi/agent/models.json" "$workdir/models.json"
  cp "$REPO_ROOT/.pi/agent/teams/"*.yaml "$workdir/teams/"
  cp "$REPO_ROOT/.pi/agent/state/schemas/task-packet.schema.json" "$workdir/state/schemas/task-packet.schema.json"
  cp "$REPO_ROOT/.pi/agent/state/schemas/handoff.schema.json" "$workdir/state/schemas/handoff.schema.json"
  (cd "$workdir" && npm install --silent >/dev/null 2>&1)
}

probe_unavailable() {
  local file="$1"
  grep -Eq 'No API key found|credit balance is too low|invalid_request_error|No models match pattern|authentication|usage limit|ChatGPT usage limit|team plan' "$file"
}

check_1_helper_generation() {
  local name="1. helper-level handoff generation"
  local out="$TMP_ROOT/check_1_helper_generation.txt"
  local runtime_dir="$TMP_ROOT/handoff-runtime"
  local cmd="cd $runtime_dir && npx tsx $TMP_ROOT/check_1_helper_generation.mts"

  cat > "$TMP_ROOT/check_1_helper_generation.mts" <<'EOF'
import { readFileSync } from "node:fs";
import { parseHandoffPolicy, generateHandoff, validateStructuredHandoff } from "./handoff-runtime/src/handoffs.ts";
import { parsePacketPolicy, generateTaskPacket } from "./handoff-runtime/src/task-packets.ts";
import { parseHarnessRoutingConfig } from "./handoff-runtime/src/harness-routing.ts";
import { parseTeamDefinition } from "./handoff-runtime/src/team-activation.ts";

const handoffPolicy = parseHandoffPolicy(JSON.parse(readFileSync("./handoffs/handoff-policy.json", "utf8")));
const packetPolicy = parsePacketPolicy(JSON.parse(readFileSync("./packets/packet-policy.json", "utf8")));
const routingConfig = parseHarnessRoutingConfig(JSON.parse(readFileSync("./models.json", "utf8")));
const teams = {
  planning: parseTeamDefinition(readFileSync("./teams/planning.yaml", "utf8"), "planning"),
  build: parseTeamDefinition(readFileSync("./teams/build.yaml", "utf8"), "build"),
  quality: parseTeamDefinition(readFileSync("./teams/quality.yaml", "utf8"), "quality"),
  recovery: parseTeamDefinition(readFileSync("./teams/recovery.yaml", "utf8"), "recovery"),
};

const packet = generateTaskPacket(packetPolicy, teams, routingConfig, {
  sourceGoalId: "harness-022",
  parentTaskId: "task-022-build",
  assignedTeam: "build",
  assignedRole: "backend_worker",
  title: "Implement handoff generator",
  scope: "Only add bounded handoff runtime logic.",
  workType: "implementation",
  domains: ["backend"],
  allowedPaths: [".pi/agent/extensions/handoffs.ts"],
  acceptanceCriteria: ["handoffs are generated", "handoff sections stay structured"],
}).packet;

const buildToWorker = generateHandoff(handoffPolicy, {
  handoffType: "build_to_worker",
  sourcePacket: packet,
  fromRole: "build_lead",
  toRole: "backend_worker",
});
validateStructuredHandoff(buildToWorker.handoff);
if (!buildToWorker.renderedHandoff.includes("## Worker Assignment")) throw new Error("expected build_to_worker headers");
if (!buildToWorker.renderedHandoff.includes("## Discovery Summary")) throw new Error("expected build_to_worker discovery summary");

const workerToQuality = generateHandoff(handoffPolicy, {
  handoffType: "worker_to_quality",
  sourcePacket: packet,
  fromRole: "backend_worker",
  toRole: "quality_lead",
  changedFiles: [".pi/agent/extensions/handoffs.ts"],
  unchangedInspected: [".pi/agent/docs/team_orchestration_architecture.md"],
  acceptanceCoverage: ["criterion 1: met", "criterion 2: met"],
  evidence: ["report path: reports/validation/2026-04-19_handoffs-validation-script.md"],
  commandsRun: ["./scripts/validate-handoffs.sh"],
  wiringVerification: ["generate_handoff tool registered and observed in validator"],
});
validateStructuredHandoff(workerToQuality.handoff);
if (!workerToQuality.renderedHandoff.includes("## Work Summary")) throw new Error("expected worker_to_quality headers");
if (!workerToQuality.renderedHandoff.includes("## Scope Boundaries")) throw new Error("expected worker_to_quality scope boundaries");
if (!workerToQuality.renderedHandoff.includes("## Evidence Expectations")) throw new Error("expected worker_to_quality evidence expectations");

const qualityToReviewer = generateHandoff(handoffPolicy, {
  handoffType: "quality_to_reviewer",
  sourcePacket: packet,
  fromRole: "quality_lead",
  toRole: "reviewer_worker",
  reviewScope: ["review handoff runtime and packet preservation"],
  claimedCompletionStatus: "candidate_complete",
  filesToInspect: [".pi/agent/extensions/handoffs.ts"],
  risksToChallenge: ["packet scope dropped in handoff", "role-pair validation too weak"],
  questionsForReviewer: ["Are any packet constraints lost in the handoff?"],
});
validateStructuredHandoff(qualityToReviewer.handoff);
if (!qualityToReviewer.renderedHandoff.includes("## Scope Boundaries")) throw new Error("expected quality_to_reviewer scope boundaries");

const qualityToValidator = generateHandoff(handoffPolicy, {
  handoffType: "quality_to_validator",
  sourcePacket: packet,
  fromRole: "quality_lead",
  toRole: "validator_worker",
  validationScope: ["validate all HARNESS-022 handoff types"],
  expectedProof: ["validator report", "exact block reason if invalid role pair is rejected"],
  validationQuestions: ["Does the handoff preserve discovery summary, scope boundaries, and wiring checks?"],
  knownGaps: ["Validator should challenge whether recovery escalation notes are still too generic."],
});
validateStructuredHandoff(qualityToValidator.handoff);
if (!qualityToValidator.renderedHandoff.includes("## Validation Questions")) throw new Error("expected quality_to_validator validation questions");

const recoveryPacket = generateTaskPacket(packetPolicy, teams, routingConfig, {
  sourceGoalId: "harness-022",
  assignedTeam: "recovery",
  assignedRole: "recovery_worker",
  title: "Analyze handoff failure",
  scope: "Recovery analysis only.",
  workType: "review_only",
  domains: ["research"],
  allowedPaths: [".pi/agent/extensions/handoffs.ts"],
  acceptanceCriteria: ["failure is summarized"],
}).packet;

const recovery = generateHandoff(handoffPolicy, {
  handoffType: "recovery_to_orchestrator_or_lead",
  sourcePacket: recoveryPacket,
  fromRole: "recovery_worker",
  toRole: "orchestrator",
  failureType: "validator_failure",
  likelyCauses: ["missing required handoff section"],
  recoveryOptions: ["retry with corrected input", "escalate if packet is contradictory"],
  recommendedAction: "retry_same_lane",
  migrationPathNote: "Not applicable; this recovery recommendation stays tactical and does not escalate architecture.",
  stopThreshold: "stop after one repeated contradictory failure",
});
validateStructuredHandoff(recovery.handoff);
if (!recovery.renderedHandoff.includes("## Migration Path Note")) throw new Error("expected recovery migration path note");

let mismatchError = "";
try {
  generateHandoff(handoffPolicy, {
    handoffType: "quality_to_reviewer",
    sourcePacket: packet,
    fromRole: "quality_lead",
    toRole: "validator_worker",
    reviewScope: ["bad route"],
    claimedCompletionStatus: "candidate_complete",
    filesToInspect: ["README.md"],
    risksToChallenge: ["wrong role pair"],
    questionsForReviewer: ["should fail"],
  });
} catch (error) {
  mismatchError = String(error);
}
if (!(mismatchError.includes("must target reviewer_worker") || mismatchError.includes("does not allow toRole validator_worker"))) {
  throw new Error(`expected reviewer mismatch error, got ${mismatchError}`);
}

let missingValidationQuestionsError = "";
try {
  generateHandoff(handoffPolicy, {
    handoffType: "quality_to_validator",
    sourcePacket: packet,
    fromRole: "quality_lead",
    toRole: "validator_worker",
    validationScope: ["validate all HARNESS-022 handoff types"],
    expectedProof: ["validator report"],
    knownGaps: ["Need one explicit risk entry before validator handoff is complete."],
  });
} catch (error) {
  missingValidationQuestionsError = String(error);
}
if (!missingValidationQuestionsError.includes("validationQuestions")) {
  throw new Error(`expected validationQuestions error, got ${missingValidationQuestionsError}`);
}

console.log(JSON.stringify({
  buildHandoffId: buildToWorker.handoff.handoffId,
  workerHandoffId: workerToQuality.handoff.handoffId,
  reviewerHandoffId: qualityToReviewer.handoff.handoffId,
  validatorHandoffId: qualityToValidator.handoff.handoffId,
  recoveryHandoffId: recovery.handoff.handoffId,
  mismatchError,
  missingValidationQuestionsError,
}, null, 2));
EOF

  if (cd "$REPO_ROOT" && bash -lc "$cmd") >"$out" 2>&1; then
    local detail="Deterministic helper-level handoff generation checks passed."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- helper checks passed for all required HARNESS-022 handoff types plus invalid role-pair rejection\n- sample output:\n\n\`\`\`json\n$(sed -n '1,160p' "$out")\n\`\`\`"
  else
    local detail="Helper-level handoff generation checks failed."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`\n$(sed -n '1,240p' "$out")\n\`\`\`"
  fi
}

check_2_schema_policy() {
  local name="2. handoff schema and policy sanity"
  local out="$TMP_ROOT/check_2_schema_policy.txt"
  local cmd="$PYTHON_BIN - <<'PY'
import json
from pathlib import Path
root = Path(r'$REPO_ROOT')
schema = json.loads((root / '.pi/agent/state/schemas/handoff.schema.json').read_text())
policy = json.loads((root / '.pi/agent/handoffs/handoff-policy.json').read_text())
required = set(schema['required'])
expected = {'version','handoffId','handoffType','sourcePacketId','sourceGoalId','fromRole','toRole','requiredHeaders','preservedPacket','details'}
missing = sorted(expected - required)
if missing:
    raise SystemExit(f'missing handoff schema required keys: {missing}')
rules = set(policy['handoff_rules'].keys())
expected_rules = {'build_to_worker','worker_to_quality','quality_to_reviewer','quality_to_validator','recovery_to_orchestrator_or_lead'}
if rules != expected_rules:
    raise SystemExit(f'unexpected handoff rule set: {sorted(rules)}')
for key, rule in policy['handoff_rules'].items():
    if not rule['required_headers']:
        raise SystemExit(f'{key} must define required headers')
    if 'required_packet_fields' not in rule:
        raise SystemExit(f'{key} must define required_packet_fields')
if '## Validation Questions' not in policy['handoff_rules']['quality_to_validator']['required_headers']:
    raise SystemExit('quality_to_validator must require Validation Questions header')
if 'migration_path_note' not in policy['handoff_rules']['recovery_to_orchestrator_or_lead']['required_detail_fields']:
    raise SystemExit('recovery handoff must require migration_path_note detail field')
print('handoff-schema-policy-ok')
PY"
  if bash -lc "$cmd" >"$out" 2>&1; then
    local detail="Handoff schema and policy sanity checks passed."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- schema required fields include the bounded HARNESS-045 handoff-completeness contract\n- handoff policy covers all required role transitions plus stronger packet/detail completeness rules\n- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  else
    local detail="Handoff schema and policy sanity checks failed."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`\n$(sed -n '1,220p' "$out")\n\`\`\`"
  fi
}

check_3_compile() {
  local name="3. handoffs extension TypeScript compile"
  local runtime_dir="$TMP_ROOT/handoff-runtime"
  local out="$TMP_ROOT/check_3_compile.txt"
  local cmd="cd $runtime_dir && npx tsc --noEmit --allowImportingTsExtensions --skipLibCheck --moduleResolution nodenext --module nodenext --target es2022 --lib es2022,dom --types node src/harness-routing.ts src/team-activation.ts src/task-packets.ts src/handoffs.ts"
  if (cd "$REPO_ROOT" && bash -lc "$cmd") >"$out" 2>&1; then
    local detail="handoffs.ts compiled successfully with its extension dependencies."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- compile result: \`PASS\`"
  else
    local detail="handoffs.ts failed to compile."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- compiler output:\n\n\`\`\`\n$(sed -n '1,240p' "$out")\n\`\`\`"
  fi
}

check_4_live_probe() {
  local name="4. live generate_handoff tool probe"
  if [[ $INCLUDE_LIVE -eq 0 ]]; then
    local detail="Live probe skipped by default to avoid unnecessary provider-backed validation spend."
    record_result "$name" "SKIP" "$detail"
    append_summary_row "$name" "SKIP" "$detail"
    append_check_section "$name" "SKIP" "- none" "- run with \`--include-live\` when one bounded live wiring proof is needed"
    return
  fi

  local out="$TMP_ROOT/check_4_live_probe.jsonl"
  local cmd="$PI_BIN --no-session --no-extensions -e $REPO_ROOT/.pi/agent/extensions/handoffs.ts -e $REPO_ROOT/.pi/agent/extensions/task-packets.ts -e $REPO_ROOT/.pi/agent/extensions/harness-routing.ts -e $REPO_ROOT/.pi/agent/extensions/team-activation.ts --mode json \"First use generate_task_packet for sourceGoalId harness-022, assignedTeam build, assignedRole backend_worker, title Implement handoff generator, scope Only add bounded handoff runtime logic, workType implementation, domains [backend], allowedPaths [.pi/agent/extensions/handoffs.ts], and acceptanceCriteria [handoff is generated]. Then use generate_handoff with handoffType build_to_worker, fromRole build_lead, toRole backend_worker, and that source packet. Finally report the handoff ID in one sentence.\""
  if (cd "$REPO_ROOT" && bash -lc "$cmd") >"$out" 2>&1; then
    if probe_unavailable "$out"; then
      local detail="Live probe skipped because provider/model access was unavailable in this environment."
      record_result "$name" "SKIP" "$detail"
      append_summary_row "$name" "SKIP" "$detail"
      append_check_section "$name" "SKIP" "$cmd" "- output indicated provider/model unavailability:\n\n\`\`\`\n$(sed -n '1,220p' "$out")\n\`\`\`"
    elif grep -Fq '"toolName":"generate_handoff"' "$out" && grep -Fq 'handoff-build-to-worker-packet-backend-worker-harness-022' "$out"; then
      local detail="Live probe observed generate_handoff and the expected handoff ID prefix."
      record_result "$name" "PASS" "$detail"
      append_summary_row "$name" "PASS" "$detail"
      append_check_section "$name" "PASS" "$cmd" "- tool call observed: \`generate_handoff\`\n- expected handoff ID prefix found: \`handoff-build-to-worker-packet-backend-worker-harness-022\`"
    else
      local detail="Live probe ran but expected tool/result evidence was missing."
      record_result "$name" "FAIL" "$detail"
      append_summary_row "$name" "FAIL" "$detail"
      append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`json\n$(sed -n '1,280p' "$out")\n\`\`\`"
    fi
  elif probe_unavailable "$out"; then
    local detail="Live probe skipped because provider/model access was unavailable in this environment."
    record_result "$name" "SKIP" "$detail"
    append_summary_row "$name" "SKIP" "$detail"
    append_check_section "$name" "SKIP" "$cmd" "- output indicated provider/model unavailability:\n\n\`\`\`\n$(sed -n '1,220p' "$out")\n\`\`\`"
  else
    local detail="Live probe failed unexpectedly."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`\n$(sed -n '1,280p' "$out")\n\`\`\`"
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
  echo "Handoffs validation PASS"
  echo "Report: $REPORT_PATH"
  echo "Summary JSON: $SUMMARY_JSON_PATH"
else
  echo "Handoffs validation FAIL ($FAILED_CHECKS failed checks)" >&2
  echo "Report: $REPORT_PATH" >&2
  echo "Summary JSON: $SUMMARY_JSON_PATH" >&2
  exit 1
fi
