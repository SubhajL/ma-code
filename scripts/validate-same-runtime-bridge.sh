#!/usr/bin/env bash
set -u -o pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DATE_STAMP="$(date +%F)"
REPORT_DIR="$REPO_ROOT/reports/validation"
DEFAULT_REPORT="$REPORT_DIR/${DATE_STAMP}_same-runtime-bridge-validation-script.md"
DEFAULT_SUMMARY_JSON="$REPORT_DIR/${DATE_STAMP}_same-runtime-bridge-validation-script.json"

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
# Automated Validation Report — Same Runtime Bridge

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
checks = [{"name": n, "status": s, "detail": d} for n, s, d in zip(names, statuses, details)]
summary = {"status": "PASS" if int(failed) == 0 else "FAIL", "failedChecks": int(failed), "checks": checks}
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(summary, f, indent=2)
    f.write("\n")
PY
}

setup_temp_runtime() {
  local workdir="$TMP_ROOT/runtime"
  mkdir -p "$workdir/src"
  cat > "$workdir/package.json" <<'JSON'
{
  "name": "same-runtime-bridge-validator-runtime",
  "private": true,
  "type": "module",
  "dependencies": {
    "typescript": "^5.9.3",
    "tsx": "^4.20.5",
    "@types/node": "^24.5.2",
    "@mariozechner/pi-coding-agent": "0.67.6",
    "@mariozechner/pi-ai": "0.67.6",
    "@sinclair/typebox": "^0.34.41"
  }
}
JSON
  cp "$REPO_ROOT/.pi/agent/extensions/same-runtime-bridge.ts" "$workdir/src/same-runtime-bridge.ts"
  (cd "$workdir" && npm install --silent >/dev/null 2>&1)
}

probe_unavailable() {
  local file="$1"
  grep -Eq 'No API key found|credit balance is too low|invalid_request_error|No models match pattern|authentication|usage limit|ChatGPT usage limit|team plan' "$file"
}

check_1_helper_logic() {
  local name="1. helper-level model and auth-source logic"
  local out="$TMP_ROOT/check_1_helper_logic.txt"
  local runtime_dir="$TMP_ROOT/runtime"
  local helper="$runtime_dir/check_1_helper_logic.mts"
  local cmd="cd $runtime_dir && npx tsx ./check_1_helper_logic.mts"
  cat > "$helper" <<'EOF'
import { AuthStorage, ModelRegistry } from "@mariozechner/pi-coding-agent";
import { classifyAuthSource, resolveProbeModel } from "./src/same-runtime-bridge.ts";

const authStorage = AuthStorage.inMemory();
const registry = ModelRegistry.inMemory(authStorage);
const current = registry.find("openai-codex", "gpt-5.4");
const mini = registry.find("openai-codex", "gpt-5.4-mini");
if (!current || !mini) throw new Error("expected built-in openai-codex models to exist");

const inherited = resolveProbeModel(current, registry, undefined, undefined);
if (!inherited.inheritedParentModel || inherited.model.id !== "gpt-5.4") {
  throw new Error("expected current model inheritance");
}

const overridden = resolveProbeModel(current, registry, "openai-codex", "gpt-5.4-mini");
if (overridden.inheritedParentModel || overridden.model.id !== "gpt-5.4-mini") {
  throw new Error("expected explicit model override");
}

authStorage.set("openai-codex", { type: "oauth", access: "a", refresh: "r", expires: Date.now() + 3600000 });
const oauthInfo = classifyAuthSource(registry, current);
if (oauthInfo.sourceClass !== "auth_storage_oauth" || !oauthInfo.oauthBacked) throw new Error("expected oauth classification");

authStorage.set("openai-codex", { type: "api_key", key: "sk-test" });
const apiKeyInfo = classifyAuthSource(registry, current);
if (apiKeyInfo.sourceClass !== "auth_storage_api_key" || apiKeyInfo.storedCredentialType !== "api_key") {
  throw new Error("expected api key classification");
}

authStorage.remove("openai-codex");
authStorage.setRuntimeApiKey("openai-codex", "runtime-key");
const runtimeInfo = classifyAuthSource(registry, current);
if (runtimeInfo.sourceClass !== "configured_external_or_runtime") throw new Error("expected external/runtime classification");

authStorage.removeRuntimeApiKey("openai-codex");
const missingInfo = classifyAuthSource(registry, current);
if (missingInfo.sourceClass !== "missing") throw new Error("expected missing classification");

console.log(JSON.stringify({
  inheritedModel: inherited.model.id,
  overrideModel: overridden.model.id,
  oauthSource: oauthInfo.sourceClass,
  apiKeySource: apiKeyInfo.sourceClass,
  runtimeSource: runtimeInfo.sourceClass,
  missingSource: missingInfo.sourceClass,
}, null, 2));
EOF
  if (cd "$REPO_ROOT" && bash -lc "$cmd") >"$out" 2>&1; then
    local detail="Helper-level model resolution and auth-source classification checks passed."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- helper checks passed for current-model inheritance, explicit override, oauth/api_key/runtime-class/missing auth classification\n- sample output:\n\n\`\`\`json\n$(sed -n '1,160p' "$out")\n\`\`\`"
  else
    local detail="Helper-level model resolution and auth-source checks failed."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`\n$(sed -n '1,220p' "$out")\n\`\`\`"
  fi
}

check_2_compile() {
  local name="2. same-runtime bridge TypeScript compile"
  local runtime_dir="$TMP_ROOT/runtime"
  local out="$TMP_ROOT/check_2_compile.txt"
  local cmd="cd $runtime_dir && npx tsc --noEmit --allowImportingTsExtensions --skipLibCheck --moduleResolution nodenext --module nodenext --target es2022 --lib es2022,dom --types node src/same-runtime-bridge.ts"
  if (cd "$REPO_ROOT" && bash -lc "$cmd") >"$out" 2>&1; then
    local detail="same-runtime-bridge.ts compiled successfully."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- compile result: \`PASS\`"
  else
    local detail="same-runtime-bridge.ts failed to compile."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- compiler output:\n\n\`\`\`\n$(sed -n '1,220p' "$out")\n\`\`\`"
  fi
}

check_3_live_probe() {
  local name="3. live same-runtime probe tool"
  if [[ $INCLUDE_LIVE -eq 0 ]]; then
    local detail="Live probe skipped by default to avoid unnecessary provider-backed validation spend."
    record_result "$name" "SKIP" "$detail"
    append_summary_row "$name" "SKIP" "$detail"
    append_check_section "$name" "SKIP" "- none" "- run with \`--include-live\` when one bounded live proof is needed"
    return
  fi
  local out="$TMP_ROOT/check_3_live_probe.jsonl"
  local cmd="$PI_BIN --no-session --no-extensions -e $REPO_ROOT/.pi/agent/extensions/same-runtime-bridge.ts --mode json \"Use run_same_runtime_probe with prompt Reply exactly PROBE_OK, toolProfile none, and includeProjectExtensions false. Then report the selected model ID and response text in one sentence.\""
  if (cd "$REPO_ROOT" && bash -lc "$cmd") >"$out" 2>&1; then
    if probe_unavailable "$out"; then
      local detail="Live probe skipped because provider/model access was unavailable in this environment."
      record_result "$name" "SKIP" "$detail"
      append_summary_row "$name" "SKIP" "$detail"
      append_check_section "$name" "SKIP" "$cmd" "- output indicated provider/model unavailability:\n\n\`\`\`\n$(sed -n '1,220p' "$out")\n\`\`\`"
    elif grep -Fq '"toolName":"run_same_runtime_probe"' "$out" && grep -Fq '"provider":"openai-codex"' "$out" && grep -Fq '"modelId":"gpt-5.4"' "$out" && grep -Fq '"responseText":"PROBE_OK"' "$out"; then
      local detail="Live probe observed run_same_runtime_probe with expected inherited model and response text."
      record_result "$name" "PASS" "$detail"
      append_summary_row "$name" "PASS" "$detail"
      append_check_section "$name" "PASS" "$cmd" "- tool call observed: \`run_same_runtime_probe\`\n- expected inherited provider/model found: \`openai-codex\` + \`gpt-5.4\`\n- expected response text found: \`PROBE_OK\`"
    else
      local detail="Live probe ran but expected bridge/result evidence was missing."
      record_result "$name" "FAIL" "$detail"
      append_summary_row "$name" "FAIL" "$detail"
      append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`json\n$(sed -n '1,260p' "$out")\n\`\`\`"
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
    append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`\n$(sed -n '1,260p' "$out")\n\`\`\`"
  fi
}

setup_temp_runtime
write_header
check_1_helper_logic
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
  echo "Same-runtime bridge validation PASS"
  echo "Report: $REPORT_PATH"
  echo "Summary JSON: $SUMMARY_JSON_PATH"
else
  echo "Same-runtime bridge validation FAIL ($FAILED_CHECKS failed checks)" >&2
  echo "Report: $REPORT_PATH" >&2
  echo "Summary JSON: $SUMMARY_JSON_PATH" >&2
  exit 1
fi
