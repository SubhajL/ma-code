#!/usr/bin/env bash
set -u -o pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DATE_STAMP="$(date +%F)"
REPORT_DIR="$REPO_ROOT/reports/validation"
DEFAULT_REPORT="$REPORT_DIR/${DATE_STAMP}_harness-tuning-data.md"
DEFAULT_SUMMARY_JSON="$REPORT_DIR/${DATE_STAMP}_harness-tuning-data.json"
PYTHON_BIN="${PYTHON_BIN:-python3}"
NODE_BIN="${NODE_BIN:-node}"
NPM_BIN="${NPM_BIN:-npm}"
REPORT_PATH="$DEFAULT_REPORT"
SUMMARY_JSON_PATH="$DEFAULT_SUMMARY_JSON"
KEEP_TEMP=0
INCLUDE_LIVE_ROUTING=0
TMP_ROOT=""

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Options:
  --report <path>          Write markdown report to a custom path
  --summary-json <path>    Write JSON summary to a custom path
  --include-live-routing   Include one bounded live harness-routing probe in the routing validator
  --keep-temp              Keep temporary validator artifacts
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
    --include-live-routing)
      INCLUDE_LIVE_ROUTING=1
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

cleanup() {
  local exit_code=$?
  if [[ $KEEP_TEMP -eq 0 && -n "$TMP_ROOT" && -d "$TMP_ROOT" ]]; then
    rm -rf "$TMP_ROOT"
  else
    echo "Temporary tuning files kept at: $TMP_ROOT" >&2
  fi
  exit "$exit_code"
}
trap cleanup EXIT

python_now() {
  "$PYTHON_BIN" - <<'PY'
import time
print(time.time())
PY
}

elapsed_ms() {
  "$PYTHON_BIN" - <<'PY' "$1" "$2"
import sys
start = float(sys.argv[1])
end = float(sys.argv[2])
print(int(round((end - start) * 1000)))
PY
}

write_record() {
  "$PYTHON_BIN" - <<'PY' "$@"
import json, sys
(
  out_path,
  name,
  category,
  command,
  status,
  failed_checks,
  elapsed_ms,
  report_path,
  summary_json_path,
  stdout_path,
  notes_json,
) = sys.argv[1:]
notes = json.loads(notes_json)
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(
        {
            "name": name,
            "category": category,
            "command": command,
            "status": status,
            "failedChecks": int(failed_checks),
            "elapsedMs": int(elapsed_ms),
            "reportPath": report_path,
            "summaryJsonPath": summary_json_path,
            "stdoutPath": stdout_path,
            "notes": notes,
        },
        f,
        indent=2,
    )
    f.write("\n")
PY
}

run_validator() {
  local name="$1"
  local script_path="$2"
  local extra_args="$3"
  local slug="$4"
  local validator_report="$TMP_ROOT/${slug}.md"
  local validator_json="$TMP_ROOT/${slug}.json"
  local validator_out="$TMP_ROOT/${slug}.out"
  local started_at ended_at elapsed command status failed_checks record_path notes_json

  started_at="$(python_now)"
  command="cd $REPO_ROOT && $script_path --report $validator_report --summary-json $validator_json $extra_args"
  if (cd "$REPO_ROOT" && bash -lc "$command") >"$validator_out" 2>&1; then
    :
  else
    :
  fi
  ended_at="$(python_now)"
  elapsed="$(elapsed_ms "$started_at" "$ended_at")"

  if [[ -f "$validator_json" ]]; then
    status="$($PYTHON_BIN - <<'PY' "$validator_json"
import json, sys
with open(sys.argv[1], encoding='utf-8') as f:
    data = json.load(f)
print(data.get('status', 'FAIL'))
PY
)"
    failed_checks="$($PYTHON_BIN - <<'PY' "$validator_json"
import json, sys
with open(sys.argv[1], encoding='utf-8') as f:
    data = json.load(f)
print(data.get('failedChecks', -1))
PY
)"
  else
    status="FAIL"
    failed_checks="-1"
  fi

  record_path="$TMP_ROOT/${slug}-record.json"
  notes_json='[]'
  write_record "$record_path" "$name" "validator" "$script_path" "$status" "$failed_checks" "$elapsed" "$validator_report" "$validator_json" "$validator_out" "$notes_json"
}

setup_schedule_runtime() {
  local workdir="$TMP_ROOT/schedule-runtime"
  mkdir -p \
    "$workdir/.pi/agent/schedules" \
    "$workdir/.pi/agent/state/runtime" \
    "$workdir/scripts"

  cat > "$workdir/package.json" <<'JSON'
{
  "name": "harness-schedule-helper-runtime",
  "private": true,
  "type": "module",
  "dependencies": {
    "tsx": "^4.20.5",
    "typescript": "^5.9.3",
    "@types/node": "^24.5.2"
  }
}
JSON

  cp "$REPO_ROOT/.pi/agent/schedules/scheduled-workflows.json" "$workdir/.pi/agent/schedules/scheduled-workflows.json"
  cp "$REPO_ROOT/scripts/harness-scheduled-workflows.ts" "$workdir/scripts/harness-scheduled-workflows.ts"
  cat > "$workdir/.pi/agent/state/runtime/queue.json" <<'JSON'
{
  "version": 1,
  "paused": false,
  "activeJobId": null,
  "jobs": []
}
JSON

  (
    cd "$workdir"
    "$NPM_BIN" install --silent >/dev/null 2>&1
  )
}

run_schedule_helper_probe() {
  local workdir="$TMP_ROOT/schedule-runtime"
  local out="$TMP_ROOT/scheduled-workflow-helper.out"
  local record_path="$TMP_ROOT/scheduled-workflow-helper-record.json"
  local started_at ended_at elapsed status failed_checks notes_json command

  setup_schedule_runtime
  started_at="$(python_now)"
  command="cd $workdir && $NODE_BIN --import tsx scripts/harness-scheduled-workflows.ts status --workflow repo-audit-run --now 2026-04-27T16:30:00.000Z --json && $NODE_BIN --import tsx scripts/harness-scheduled-workflows.ts materialize --workflow repo-audit-run --now 2026-04-27T16:30:00.000Z --json"

  if (
    cd "$workdir" &&
    "$NODE_BIN" --import tsx scripts/harness-scheduled-workflows.ts status --workflow repo-audit-run --now 2026-04-27T16:30:00.000Z --json >"$TMP_ROOT/scheduled-status.json" 2>"$TMP_ROOT/scheduled-status.err" &&
    "$NODE_BIN" --import tsx scripts/harness-scheduled-workflows.ts materialize --workflow repo-audit-run --now 2026-04-27T16:30:00.000Z --json >"$TMP_ROOT/scheduled-materialize.json" 2>"$TMP_ROOT/scheduled-materialize.err"
  ) >"$out" 2>&1; then
    if "$PYTHON_BIN" - <<'PY' "$TMP_ROOT/scheduled-status.json" "$TMP_ROOT/scheduled-materialize.json"
import json, sys
with open(sys.argv[1], encoding='utf-8') as f:
    status = json.load(f)
with open(sys.argv[2], encoding='utf-8') as f:
    materialize = json.load(f)
assert status.get('eligibleWorkflowIds') == ['repo-audit-run'], status
assert materialize.get('createdJobIds') == [], materialize
assert materialize.get('eligibleWorkflowIds') == ['repo-audit-run'], materialize
print('scheduled-helper-probe-ok')
PY
    then
      status="PASS"
      failed_checks="0"
    else
      status="FAIL"
      failed_checks="1"
    fi
  else
    status="FAIL"
    failed_checks="1"
  fi

  ended_at="$(python_now)"
  elapsed="$(elapsed_ms "$started_at" "$ended_at")"

  notes_json="$($PYTHON_BIN - <<'PY' "$TMP_ROOT/scheduled-status.json" "$TMP_ROOT/scheduled-materialize.json"
import json, sys
notes = []
for path, label in [(sys.argv[1], 'status'), (sys.argv[2], 'materialize')]:
    try:
        with open(path, encoding='utf-8') as f:
            data = json.load(f)
        notes.append(f"{label}: due={data.get('dueWorkflowIds')} eligible={data.get('eligibleWorkflowIds')} created={data.get('createdJobIds')}")
    except FileNotFoundError:
        notes.append(f"{label}: output missing")
print(json.dumps(notes))
PY
)"

  write_record "$record_path" "Scheduled workflow dry-run helper" "helper_probe" "$command" "$status" "$failed_checks" "$elapsed" "$TMP_ROOT/scheduled-status.json" "$TMP_ROOT/scheduled-materialize.json" "$out" "$notes_json"
}

routing_args=""
if [[ $INCLUDE_LIVE_ROUTING -eq 1 ]]; then
  routing_args="--include-live"
fi

run_validator "Harness routing validator" "./scripts/validate-harness-routing.sh" "$routing_args" "harness-routing"
run_validator "Queue runner validator" "./scripts/validate-queue-runner.sh" "--skip-live" "queue-runner"
run_validator "Core workflows validator" "./scripts/validate-core-workflows.sh" "" "core-workflows"
run_schedule_helper_probe

$PYTHON_BIN - <<'PY' "$REPO_ROOT/.pi/agent/models.json" "$TMP_ROOT" "$REPORT_PATH" "$SUMMARY_JSON_PATH"
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

models_path = Path(sys.argv[1])
tmp_root = Path(sys.argv[2])
report_path = Path(sys.argv[3])
summary_path = Path(sys.argv[4])

record_names = [
    "harness-routing-record.json",
    "queue-runner-record.json",
    "core-workflows-record.json",
    "scheduled-workflow-helper-record.json",
]
records = []
for name in record_names:
    with open(tmp_root / name, encoding="utf-8") as f:
        records.append(json.load(f))

with open(models_path, encoding="utf-8") as f:
    models = json.load(f)

thinking_policy = models.get("thinking_policy", {})
routing_defaults = models.get("routing_defaults", {})
routing_policy = models.get("routing_policy", {})
critical_roles = set(routing_policy.get("critical_roles", []))
tuning_history = models.get("tuning_history", [])

model_weights = {
    "gpt-5.4-mini": 0.42,
    "gpt-5.4": 1.0,
    "claude-sonnet-4-6": 1.3,
    "claude-opus-4-5": 1.8,
}
thinking_weights = {
    "off": 0.45,
    "minimal": 0.55,
    "low": 0.7,
    "medium": 0.9,
    "high": 1.1,
    "xhigh": 1.25,
}

def model_weight(model_id: str) -> float:
    model = model_id.split("/", 1)[-1]
    return model_weights.get(model, 1.0)

def thinking_weight(level: str) -> float:
    return thinking_weights.get(level, 1.0)

role_defaults = {}
role_cost_index = []
for role, entry in routing_defaults.items():
    model_id = f"{entry.get('provider')}/{entry.get('default_model')}"
    thinking = entry.get('thinking')
    budget_overrides = entry.get('budget_overrides', [])
    cost_index = round(model_weight(model_id) * thinking_weight(thinking), 3)
    role_defaults[role] = {
        "model": model_id,
        "thinking": thinking,
        "budgetOverrides": budget_overrides,
        "costIndex": cost_index,
        "critical": role in critical_roles,
    }
    role_cost_index.append(
        {
            "role": role,
            "model": model_id,
            "thinking": thinking,
            "costIndex": cost_index,
            "critical": role in critical_roles,
            "hasBudgetOverride": len(budget_overrides) > 0,
        }
    )

role_cost_index.sort(key=lambda item: (-item["costIndex"], item["role"]))
expensive_roles = role_cost_index[:5]
remaining_noncritical_without_budget_relief = [
    item for item in role_cost_index if not item["critical"] and item["costIndex"] >= 0.7 and not item["hasBudgetOverride"]
]
weak_value_escalations = []
for item in remaining_noncritical_without_budget_relief:
    weak_value_escalations.append(
        f"{item['role']} still costs index {item['costIndex']:.3f} with no budget override path."
    )
if not weak_value_escalations:
    weak_value_escalations.append(
        "No obvious remaining non-critical weak-value escalation paths were found after the current tuning pass; the remaining expensive defaults are concentrated in critical roles."
    )

status = "PASS" if all(record.get("status") == "PASS" for record in records) else "FAIL"
validator_records = [record for record in records if record.get("category") == "validator"]
helper_records = [record for record in records if record.get("category") == "helper_probe"]
max_elapsed = max((int(record.get("elapsedMs", 0)) for record in records), default=0)

recommendations = [
    "Keep critical roles on a high-thinking floor and prefer cheaper default reasoning only for non-critical roles unless evidence shows quality regressions.",
]
if status != "PASS":
    recommendations.append(
        "Stop further tuning until every validator/helper probe is green again; failed proof makes the timing data too noisy for routing changes."
    )
else:
    recommendations.append(
        "Use the combined harness-routing, queue-runner, core-workflow, and scheduled-helper timings as the bounded local evidence set for routing changes instead of intuition or repeated live probes."
    )
    if max_elapsed >= 120000:
        recommendations.append(
            "The routing validator still dominates elapsed time, so keep squeezing non-critical defaults and budget-pressure paths before touching critical-role models."
        )
    else:
        recommendations.append(
            "Validator timings are bounded enough that the current cheaper non-critical defaults should remain unless later queue/schedule workloads show new cost pressure."
        )

summary = {
    "status": status,
    "generatedAt": datetime.now(timezone.utc).isoformat(),
    "realIntegrationData": True,
    "records": records,
    "thinkingPolicy": thinking_policy,
    "roleDefaults": role_defaults,
    "roleCostIndex": role_cost_index,
    "expensiveRoles": expensive_roles,
    "weakValueEscalations": weak_value_escalations,
    "tuningHistory": tuning_history,
    "recommendations": recommendations,
}

with open(summary_path, "w", encoding="utf-8") as f:
    json.dump(summary, f, indent=2)
    f.write("\n")

lines = [
    "# Harness Thinking/Cost Tuning Report",
    "",
    f"- Generated at: {summary['generatedAt']}",
    f"- Status: {status}",
    "- Real integration data: yes (bounded local validators/helpers were executed in this run)",
    "",
    "## Timed checks",
    "",
    "| Check | Category | Status | Failed checks | Elapsed ms |",
    "|---|---|---|---:|---:|",
]
for record in records:
    lines.append(
        f"| {record['name']} | {record['category']} | {record['status']} | {record['failedChecks']} | {record['elapsedMs']} |"
    )

lines.extend([
    "",
    "## Thinking calibration baseline",
    "",
    f"- Critical role minimum: `{thinking_policy.get('critical_role_minimum', 'n/a')}`",
    f"- Reason adjustments: `{json.dumps(thinking_policy.get('reason_adjustments', {}), sort_keys=True)}`",
    f"- Budget mode caps: `{json.dumps(thinking_policy.get('budget_mode_caps', {}), sort_keys=True)}`",
    "",
    "## Role defaults and cost-ish index",
    "",
    "| Role | Default model | Default thinking | Cost-ish index | Critical | Budget override path |",
    "|---|---|---|---:|---|---|",
])
for item in role_cost_index:
    overrides = "yes" if item["hasBudgetOverride"] else "no"
    lines.append(
        f"| {item['role']} | {item['model']} | {item['thinking']} | {item['costIndex']:.3f} | {'yes' if item['critical'] else 'no'} | {overrides} |"
    )

lines.extend([
    "",
    "## Most expensive current defaults",
    "",
])
for item in expensive_roles:
    lines.append(
        f"- `{item['role']}` -> `{item['model']}` at `{item['thinking']}` (cost-ish index `{item['costIndex']:.3f}`, critical={str(item['critical']).lower()})"
    )

lines.extend([
    "",
    "## Weak-value escalation notes",
    "",
])
for note in weak_value_escalations:
    lines.append(f"- {note}")

if tuning_history:
    lines.extend([
        "",
        "## Documented routing changes",
        "",
    ])
    for entry in tuning_history:
        lines.append(f"### {entry.get('date', 'undated')} — {entry.get('scope', 'routing change')}")
        lines.append("")
        before = entry.get('before', [])
        after = entry.get('after', [])
        rationale = entry.get('rationale', '')
        if before:
            lines.append("Before:")
            for item in before:
                lines.append(f"- {item}")
            lines.append("")
        if after:
            lines.append("After:")
            for item in after:
                lines.append(f"- {item}")
            lines.append("")
        if rationale:
            lines.append(f"Rationale: {rationale}")
            lines.append("")

lines.extend([
    "## Recommendations",
    "",
])
for recommendation in recommendations:
    lines.append(f"- {recommendation}")

report_path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
PY

status="$($PYTHON_BIN - <<'PY' "$SUMMARY_JSON_PATH"
import json, sys
with open(sys.argv[1], encoding='utf-8') as f:
    data = json.load(f)
print(data['status'])
PY
)"

if [[ "$status" != "PASS" ]]; then
  echo "Harness tuning data collection FAIL"
  echo "Report: $REPORT_PATH"
  echo "Summary JSON: $SUMMARY_JSON_PATH"
  exit 1
fi

echo "Harness tuning data collection PASS"
echo "Report: $REPORT_PATH"
echo "Summary JSON: $SUMMARY_JSON_PATH"
