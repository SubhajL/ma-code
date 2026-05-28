#!/usr/bin/env bash
set -u -o pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DATE_STAMP="$(date +%F)"
REPORT_DIR="$REPO_ROOT/reports/validation"
DEFAULT_REPORT="$REPORT_DIR/${DATE_STAMP}_prompt-semantics-live-validation-script.md"
DEFAULT_SUMMARY_JSON="$REPORT_DIR/${DATE_STAMP}_prompt-semantics-live-validation-script.json"
SEMANTICS_FILE="$REPO_ROOT/.pi/agent/validation/prompt-semantics.json"
PI_BIN="${PI_BIN:-pi}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
NODE_BIN="${NODE_BIN:-node}"
TSX_IMPORT="${TSX_IMPORT:-tsx}"
KEEP_TEMP=0
SKIP_LIVE=0
REPORT_PATH="$DEFAULT_REPORT"
SUMMARY_JSON_PATH="$DEFAULT_SUMMARY_JSON"

TMP_ROOT=""
CHECK_NAMES=()
CHECK_STATUS=()
CHECK_DETAILS=()
FAILED_CHECKS=0
LOCAL_GATE_PASSED=0

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Options:
  --report <path>          Write markdown report to a custom path
  --summary-json <path>    Write JSON summary to a custom path
  --keep-temp              Keep temporary validation directories and files
  --skip-live              Skip the provider-backed live probe; emits a
                           deterministic SKIP for check 2. Use in CI or any
                           context where hitting a live provider is
                           undesirable.
  -h, --help               Show this help text

Environment overrides:
  PI_BIN=<path>            Pi executable to use (default: pi)
  PYTHON_BIN=<path>        Python executable to use (default: python3)
  NODE_BIN=<path>          Node executable to use (default: node)
  TSX_IMPORT=<path>        tsx import specifier (default: tsx)
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
    --skip-live)
      SKIP_LIVE=1
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
# Automated Validation Report — Prompt Semantics Live Proof

- Date: $DATE_STAMP
- Generated at: $(date '+%Y-%m-%dT%H:%M:%S%z')
- Repo root: $REPO_ROOT
- Pi binary: $PI_BIN
- Python binary: $PYTHON_BIN
- Live proof policy: local-first, one bounded provider-backed probe, no automatic retries
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

  # Emit the canonical JSON via the typed contract module
  # (`.pi/agent/extensions/lib/validator-report.ts`, ADR-0007). The TS
  # emitter validates the shape against the typed contract and writes
  # byte-equivalent JSON to $SUMMARY_JSON_PATH. Byte-equivalence with
  # the prior Python emission is locked down by a golden test in
  # tests/extension-units/validator-report.test.ts.
  #
  # The script runs under `set -u -o pipefail` (no -e), so a non-zero
  # exit from the emitter would otherwise be silently dropped on the
  # floor — and downstream consumers would see a missing JSON file
  # instead of a typed contract violation. Surface the failure
  # explicitly here.
  if ! "$NODE_BIN" --import "$TSX_IMPORT" "$REPO_ROOT/scripts/lib/emit-validator-report.ts" \
      --out "$SUMMARY_JSON_PATH" \
      --names-file "$SUMMARY_NAMES_FILE" \
      --statuses-file "$SUMMARY_STATUS_FILE" \
      --details-file "$SUMMARY_DETAILS_FILE"; then
    echo "prompt-semantics-live-validation: FAIL (emit-validator-report failed; see stderr above)" >&2
    exit 1
  fi
}

probe_unavailable() {
  local file="$1"
  grep -Eq 'No API key found|No configured auth is available|credit balance is too low|invalid_request_error|No models match pattern|authentication|usage limit|ChatGPT usage limit|team plan|provider unavailable' "$file"
}

prepare_live_probe_artifacts() {
  "$PYTHON_BIN" - <<'PY' "$SEMANTICS_FILE" "$REPO_ROOT" "$TMP_ROOT/live_probe_system_prompt.txt" "$TMP_ROOT/live_probe_user_prompt.txt" "$TMP_ROOT/live_probe_role.txt" "$TMP_ROOT/live_probe_meta.json"
import json, sys
from pathlib import Path
semantics_path, repo_root, system_out, user_out, role_out, meta_out = sys.argv[1:]
semantics = json.loads(Path(semantics_path).read_text(encoding="utf-8"))
live = semantics.get("liveProof")
if not isinstance(live, dict):
    raise SystemExit("prompt-semantics liveProof config is missing or invalid")
role = live.get("role")
prompt_path = live.get("promptPath")
scenario = live.get("scenarioPrompt")
probe_id = live.get("id")
if not all(isinstance(value, str) and value.strip() for value in [role, prompt_path, scenario, probe_id]):
    raise SystemExit("prompt-semantics liveProof config requires id, role, promptPath, and scenarioPrompt strings")
role_prompt = (Path(repo_root) / prompt_path).read_text(encoding="utf-8").strip() + "\n"
user_prompt = scenario.strip() + "\n"
Path(system_out).write_text(role_prompt, encoding="utf-8")
Path(user_out).write_text(user_prompt, encoding="utf-8")
Path(role_out).write_text(role.strip() + "\n", encoding="utf-8")
Path(meta_out).write_text(json.dumps({"id": probe_id, "role": role, "promptPath": prompt_path}, indent=2) + "\n", encoding="utf-8")
PY
}

build_temp_fixture() {
  "$PYTHON_BIN" - <<'PY' "$1" "$2" "$3"
import json, sys
from pathlib import Path
role_path, response_path, fixture_path = sys.argv[1:]
role = Path(role_path).read_text(encoding="utf-8").strip()
response = Path(response_path).read_text(encoding="utf-8")
fixture = {
    "version": 1,
    "fixtures": [
        {
            "id": "live_probe_response",
            "role": role,
            "expect": "pass",
            "content": response,
        }
    ],
}
Path(fixture_path).write_text(json.dumps(fixture, indent=2) + "\n", encoding="utf-8")
PY
}

check_1_local_semantics_gate() {
  local name="1. local semantic fixture gate"
  local out="$TMP_ROOT/check_1_local_semantics_gate.txt"
  local cmd="bash $REPO_ROOT/scripts/validate-prompt-semantics.sh"

  if bash "$REPO_ROOT/scripts/validate-prompt-semantics.sh" >"$out" 2>&1; then
    LOCAL_GATE_PASSED=1
    local detail="Local semantic validator passed; live proof is eligible to run once."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  else
    LOCAL_GATE_PASSED=0
    local detail="Local semantic validator failed, so the live probe was refused by policy."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  fi
}

check_2_single_live_probe() {
  local name="2. single provider-backed semantic live probe"
  local system_prompt_file="$TMP_ROOT/live_probe_system_prompt.txt"
  local user_prompt_file="$TMP_ROOT/live_probe_user_prompt.txt"
  local role_file="$TMP_ROOT/live_probe_role.txt"
  local meta_file="$TMP_ROOT/live_probe_meta.json"
  local out="$TMP_ROOT/check_2_single_live_probe.txt"
  local response_file="$TMP_ROOT/live_probe_response.txt"
  local fixture_file="$TMP_ROOT/live_probe_fixture.json"
  local verify_out="$TMP_ROOT/check_2_live_semantics_verify.txt"
  local cmd="$PI_BIN --no-session --no-extensions --no-tools --system-prompt \"<prompt from $system_prompt_file>\" \"<prompt from $user_prompt_file>\""

  if [[ $SKIP_LIVE -eq 1 ]]; then
    # Deterministic SKIP path for CI or any caller that does not want to
    # touch a live provider on this run. Distinct from the other SKIP
    # branches (local-gate failed, pi missing, probe_unavailable) so
    # operators can tell from the JSON exactly why the probe did not run.
    local detail="Live probe skipped by --skip-live flag (caller opted out of provider-backed validation)."
    record_result "$name" "SKIP" "$detail"
    append_summary_row "$name" "SKIP" "$detail"
    append_check_section "$name" "SKIP" "$cmd" "- explicitly skipped via --skip-live flag"
    return
  fi

  if [[ $LOCAL_GATE_PASSED -eq 0 ]]; then
    local detail="Live probe skipped because the required local semantic gate failed first."
    record_result "$name" "SKIP" "$detail"
    append_summary_row "$name" "SKIP" "$detail"
    append_check_section "$name" "SKIP" "$cmd" "- not attempted because local-first policy blocked the live path"
    return
  fi

  if ! command -v "$PI_BIN" >/dev/null 2>&1; then
    local detail="Live probe skipped because the configured Pi binary was not available in PATH."
    record_result "$name" "SKIP" "$detail"
    append_summary_row "$name" "SKIP" "$detail"
    append_check_section "$name" "SKIP" "$cmd" "- missing Pi binary: $PI_BIN"
    return
  fi

  if ! prepare_live_probe_artifacts >"$TMP_ROOT/check_2_prepare.txt" 2>&1; then
    local detail="Live probe configuration could not be prepared from prompt-semantics.json."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- preparation output:\n\n\`\`\`\n$(cat "$TMP_ROOT/check_2_prepare.txt")\n\`\`\`"
    return
  fi

  if "$PI_BIN" --no-session --no-extensions --no-tools --system-prompt "$(cat "$system_prompt_file")" "$(cat "$user_prompt_file")" >"$out" 2>&1; then
    :
  fi

  if probe_unavailable "$out"; then
    local detail="Live probe skipped because provider/auth/model access was unavailable in this environment."
    record_result "$name" "SKIP" "$detail"
    append_summary_row "$name" "SKIP" "$detail"
    append_check_section "$name" "SKIP" "$cmd" "- provider-backed validation unavailable:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
    return
  fi

  if [[ ! -s "$out" ]]; then
    local detail="Live probe produced no output."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- output file was empty"
    return
  fi

  cp "$out" "$response_file"
  build_temp_fixture "$role_file" "$response_file" "$fixture_file"

  if bash "$REPO_ROOT/scripts/validate-prompt-semantics.sh" --fixtures "$fixture_file" >"$verify_out" 2>&1; then
    local role
    role="$(cat "$role_file")"
    local detail="Observed exactly one direct provider-backed semantic response for role ${role//$'\n'/} and it passed the existing semantic validator."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- live probe meta:\n\n\`\`\`json\n$(cat "$meta_file")\n\`\`\`\n- provider response:\n\n\`\`\`\n$(cat "$response_file")\n\`\`\`\n- semantic verification output:\n\n\`\`\`\n$(cat "$verify_out")\n\`\`\`"
  else
    local detail="Live probe returned a response, but it did not satisfy the semantic validator."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- live probe meta:\n\n\`\`\`json\n$(cat "$meta_file")\n\`\`\`\n- provider response:\n\n\`\`\`\n$(cat "$response_file")\n\`\`\`\n- semantic verification output:\n\n\`\`\`\n$(cat "$verify_out")\n\`\`\`"
  fi
}

write_header
check_1_local_semantics_gate
check_2_single_live_probe
cat "$SUMMARY_TABLE_FILE" >> "$REPORT_PATH"
cat "$DETAILS_FILE" >> "$REPORT_PATH"
write_json_summary

if [[ $FAILED_CHECKS -eq 0 ]]; then
  echo "prompt-semantics-live-validation: PASS"
  echo "- markdown report: $REPORT_PATH"
  echo "- summary json: $SUMMARY_JSON_PATH"
else
  echo "prompt-semantics-live-validation: FAIL" >&2
  echo "- markdown report: $REPORT_PATH" >&2
  echo "- summary json: $SUMMARY_JSON_PATH" >&2
  exit 1
fi
