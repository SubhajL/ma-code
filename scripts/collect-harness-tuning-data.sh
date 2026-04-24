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

run_validator() {
  local name="$1"
  local script_path="$2"
  local extra_args="$3"
  local slug="$4"
  local validator_report="$TMP_ROOT/${slug}.md"
  local validator_json="$TMP_ROOT/${slug}.json"
  local validator_out="$TMP_ROOT/${slug}.out"
  local started_at ended_at elapsed_ms command status failed_checks

  started_at="$($PYTHON_BIN - <<'PY'
import time
print(time.time())
PY
)"

  command="cd $REPO_ROOT && $script_path --report $validator_report --summary-json $validator_json $extra_args"
  if (cd "$REPO_ROOT" && bash -lc "$command") >"$validator_out" 2>&1; then
    :
  else
    :
  fi

  ended_at="$($PYTHON_BIN - <<'PY'
import time
print(time.time())
PY
)"

  elapsed_ms="$($PYTHON_BIN - <<'PY' "$started_at" "$ended_at"
import sys
start = float(sys.argv[1])
end = float(sys.argv[2])
print(int(round((end - start) * 1000)))
PY
)"

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

  "$PYTHON_BIN" - <<'PY' "$TMP_ROOT/${slug}-record.json" "$name" "$script_path" "$status" "$failed_checks" "$elapsed_ms" "$validator_report" "$validator_json" "$validator_out"
import json, sys
out_path, name, script_path, status, failed_checks, elapsed_ms, report_path, summary_json_path, stdout_path = sys.argv[1:]
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(
        {
            "name": name,
            "script": script_path,
            "status": status,
            "failedChecks": int(failed_checks),
            "elapsedMs": int(elapsed_ms),
            "reportPath": report_path,
            "summaryJsonPath": summary_json_path,
            "stdoutPath": stdout_path,
        },
        f,
        indent=2,
    )
    f.write("\n")
PY
}

routing_args=""
if [[ $INCLUDE_LIVE_ROUTING -eq 1 ]]; then
  routing_args="--include-live"
fi

run_validator "Harness routing validator" "./scripts/validate-harness-routing.sh" "$routing_args" "harness-routing"
run_validator "Core workflows validator" "./scripts/validate-core-workflows.sh" "" "core-workflows"

$PYTHON_BIN - <<'PY' "$REPO_ROOT/.pi/agent/models.json" "$TMP_ROOT" "$REPORT_PATH" "$SUMMARY_JSON_PATH"
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

models_path = Path(sys.argv[1])
tmp_root = Path(sys.argv[2])
report_path = Path(sys.argv[3])
summary_path = Path(sys.argv[4])

records = []
for name in ["harness-routing-record.json", "core-workflows-record.json"]:
    with open(tmp_root / name, encoding="utf-8") as f:
        records.append(json.load(f))

with open(models_path, encoding="utf-8") as f:
    models = json.load(f)

thinking_policy = models.get("thinking_policy", {})
routing_defaults = models.get("routing_defaults", {})
role_defaults = {
    role: {
        "model": f"{entry.get('provider')}/{entry.get('default_model')}",
        "thinking": entry.get("thinking"),
    }
    for role, entry in routing_defaults.items()
}

status = "PASS" if all(record.get("status") == "PASS" for record in records) else "FAIL"
max_elapsed = max((int(record.get("elapsedMs", 0)) for record in records), default=0)

recommendations = [
    "Calibrate thinking policy first: keep critical roles at a high-thinking floor and adjust non-critical roles with deterministic reason/budget rules before changing provider/model defaults.",
]

if status != "PASS":
    recommendations.append(
        "Stop cost/performance tuning until the failed validator is green again; otherwise observed timings are not trustworthy enough to drive routing changes."
    )
else:
    recommendations.append(
        "Use these validator timings as real integration data for the next routing pass instead of ad hoc intuition or repeated live-provider probes."
    )
    if max_elapsed >= 90000:
        recommendations.append(
            "Observed integration runtime is high; first try budget-pressure routes and lower thinking for non-critical build/research/docs roles before touching critical-role defaults."
        )
    elif max_elapsed >= 45000:
        recommendations.append(
            "Observed runtime is moderate; collect a small baseline of repeated local runs before lowering models, then tune only the roles that dominate the slow path."
        )
    else:
        recommendations.append(
            "Observed runtime is already bounded; keep the calibrated thinking defaults and only widen budget overrides if later real runs show sustained cost pressure."
        )

summary = {
    "status": status,
    "generatedAt": datetime.now(timezone.utc).isoformat(),
    "realIntegrationData": True,
    "validators": records,
    "thinkingPolicy": thinking_policy,
    "roleDefaults": role_defaults,
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
    "- Real integration data: yes (validators were executed in this run)",
    "",
    "## Validator timings",
    "",
    "| Validator | Status | Failed checks | Elapsed ms |",
    "|---|---|---:|---:|",
]
for record in records:
    lines.append(
        f"| {record['name']} | {record['status']} | {record['failedChecks']} | {record['elapsedMs']} |"
    )

lines.extend([
    "",
    "## Thinking calibration baseline",
    "",
    f"- Critical role minimum: `{thinking_policy.get('critical_role_minimum', 'n/a')}`",
    f"- Reason adjustments: `{json.dumps(thinking_policy.get('reason_adjustments', {}), sort_keys=True)}`",
    f"- Budget mode caps: `{json.dumps(thinking_policy.get('budget_mode_caps', {}), sort_keys=True)}`",
    "",
    "## Role defaults",
    "",
    "| Role | Default model | Default thinking |",
    "|---|---|---|",
])
for role in sorted(role_defaults):
    entry = role_defaults[role]
    lines.append(f"| {role} | {entry['model']} | {entry['thinking']} |")

lines.extend([
    "",
    "## Recommendations",
    "",
])
for recommendation in recommendations:
    lines.append(f"- {recommendation}")

report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
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
