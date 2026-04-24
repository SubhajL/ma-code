#!/usr/bin/env bash
set -u -o pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DATE_STAMP="$(date +%F)"
REPORT_DIR="$REPO_ROOT/reports/validation"
DEFAULT_REPORT="$REPORT_DIR/${DATE_STAMP}_harness-package-validation-script.md"
DEFAULT_SUMMARY_JSON="$REPORT_DIR/${DATE_STAMP}_harness-package-validation-script.json"
NODE_BIN="${NODE_BIN:-node}"
NPM_BIN="${NPM_BIN:-npm}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
REPORT_PATH="$DEFAULT_REPORT"
SUMMARY_JSON_PATH="$DEFAULT_SUMMARY_JSON"
KEEP_TEMP=0
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
  --keep-temp              Keep temporary validation files
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
# Automated Validation Report — Harness Package Bootstrap

- Date: $DATE_STAMP
- Generated at: $(date '+%Y-%m-%dT%H:%M:%S%z')
- Repo root: $REPO_ROOT
- Node binary: $NODE_BIN
- npm binary: $NPM_BIN
- Python binary: $PYTHON_BIN
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
with open(names_path, encoding='utf-8') as f:
    names = [line.rstrip('\n') for line in f]
with open(statuses_path, encoding='utf-8') as f:
    statuses = [line.rstrip('\n') for line in f]
with open(details_path, encoding='utf-8') as f:
    details = [line.rstrip('\n') for line in f]
checks = [{"name": n, "status": s, "detail": d} for n, s, d in zip(names, statuses, details)]
summary = {"status": "PASS" if int(failed) == 0 else "FAIL", "failedChecks": int(failed), "checks": checks}
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(summary, f, indent=2)
    f.write("\n")
PY
}

setup_temp_runtime() {
  local workdir="$TMP_ROOT/package-runtime"
  mkdir -p "$workdir/scripts" "$workdir/tests/integration"
  cat > "$workdir/package.json" <<'JSON'
{
  "name": "harness-package-validator-runtime",
  "private": true,
  "type": "module",
  "dependencies": {
    "tsx": "^4.20.5",
    "typescript": "^5.9.3",
    "@types/node": "^24.5.2"
  }
}
JSON
  cp "$REPO_ROOT/scripts/harness-package.ts" "$workdir/scripts/harness-package.ts"
  cp "$REPO_ROOT/tests/integration/harness-package.test.ts" "$workdir/tests/integration/harness-package.test.ts"
  (
    cd "$workdir"
    "$NPM_BIN" install --silent >/dev/null 2>&1
  )
}

check_1_compile_package_helper() {
  local name="1. harness package helper compiles"
  local out="$TMP_ROOT/check_1_compile_package_helper.txt"
  local runtime_dir="$TMP_ROOT/package-runtime"
  local cmd="cd $runtime_dir && npx tsc --noEmit --skipLibCheck --allowImportingTsExtensions --moduleResolution nodenext --module nodenext --target es2022 --lib es2022,dom --types node scripts/harness-package.ts tests/integration/harness-package.test.ts"

  if (
    cd "$runtime_dir" &&
    npx tsc --noEmit --skipLibCheck --allowImportingTsExtensions --moduleResolution nodenext --module nodenext --target es2022 --lib es2022,dom --types node \
      scripts/harness-package.ts \
      tests/integration/harness-package.test.ts >"$out" 2>&1
  ); then
    local detail="harness-package helper and bootstrap integration test compile in an isolated runtime package."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  else
    local detail="harness-package compile check failed."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  fi
}

check_2_bootstrap_integration() {
  local name="2. harness package bootstrap integration"
  local out="$TMP_ROOT/check_2_bootstrap_integration.txt"
  local runtime_dir="$TMP_ROOT/package-runtime"
  local cmd="cd $runtime_dir && HARNESS_SOURCE_ROOT=$REPO_ROOT $NODE_BIN --import tsx --test tests/integration/harness-package.test.ts"

  if (
    cd "$runtime_dir" &&
    HARNESS_SOURCE_ROOT="$REPO_ROOT" "$NODE_BIN" --import tsx --test tests/integration/harness-package.test.ts >"$out" 2>&1
  ); then
    local detail="bootstrap integration tests passed for reusable asset copy, fresh runtime placeholder generation, package.json merge behavior, and preservation of existing repo-local files."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  else
    local detail="bootstrap integration tests failed."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  fi
}

check_3_manifest_and_install_docs() {
  local name="3. package manifest/install/operator doc wiring"
  local out="$TMP_ROOT/check_3_manifest_and_install_docs.txt"
  local cmd="$PYTHON_BIN $TMP_ROOT/check_3_manifest_and_install_docs.py"

  cat > "$TMP_ROOT/check_3_manifest_and_install_docs.py" <<'PY'
import json
import sys
from pathlib import Path
root = Path(sys.argv[1])
manifest = json.loads((root / '.pi/agent/package/harness-package.json').read_text(encoding='utf-8'))
checks = {
    'manifest version': manifest.get('version') == 1,
    'manifest packageVersion': isinstance(manifest.get('packageVersion'), str) and len(manifest['packageVersion']) > 0,
    'manifest reusable assets': isinstance(manifest.get('reusableAssets'), list) and len(manifest['reusableAssets']) > 0,
    'README.md': 'harness:package' in (root / 'README.md').read_text(encoding='utf-8') and 'operator_manual.md' in (root / 'README.md').read_text(encoding='utf-8'),
    '.pi/agent/docs/harness_packaging_strategy.md': 'bootstrap' in (root / '.pi/agent/docs/harness_packaging_strategy.md').read_text(encoding='utf-8').lower(),
    '.pi/agent/docs/harness_package_install.md': 'harness-package.ts bootstrap' in (root / '.pi/agent/docs/harness_package_install.md').read_text(encoding='utf-8') and 'operator_manual.md' in (root / '.pi/agent/docs/harness_package_install.md').read_text(encoding='utf-8'),
    '.pi/agent/docs/operator_manual.md': 'operator_install_guide.md' in (root / '.pi/agent/docs/operator_manual.md').read_text(encoding='utf-8') and 'operator_troubleshooting_guide.md' in (root / '.pi/agent/docs/operator_manual.md').read_text(encoding='utf-8'),
    '.pi/agent/docs/operator_quickstart.md': 'operator_manual.md' in (root / '.pi/agent/docs/operator_quickstart.md').read_text(encoding='utf-8'),
    '.pi/agent/docs/operator_workflow.md': 'operator_manual.md' in (root / '.pi/agent/docs/operator_workflow.md').read_text(encoding='utf-8'),
    'package.json': 'validate:harness-package' in json.loads((root / 'package.json').read_text(encoding='utf-8')).get('scripts', {}),
}
missing = [name for name, ok in checks.items() if not ok]
assert not missing, f'missing package/install/operator-doc wiring in: {missing}'
print('harness-package-wiring-ok')
PY

  if "$PYTHON_BIN" "$TMP_ROOT/check_3_manifest_and_install_docs.py" "$REPO_ROOT" >"$out" 2>&1; then
    local detail="package manifest, install docs, package-script wiring, and operator-doc entrypoints are present for repeatable harness bootstrap and onboarding."
    record_result "$name" "PASS" "$detail"
    append_summary_row "$name" "PASS" "$detail"
    append_check_section "$name" "PASS" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  else
    local detail="package manifest/install/operator-doc wiring is incomplete."
    record_result "$name" "FAIL" "$detail"
    append_summary_row "$name" "FAIL" "$detail"
    append_check_section "$name" "FAIL" "$cmd" "- output:\n\n\`\`\`\n$(cat "$out")\n\`\`\`"
  fi
}

main() {
  write_header
  setup_temp_runtime
  check_1_compile_package_helper
  check_2_bootstrap_integration
  check_3_manifest_and_install_docs

  cat "$SUMMARY_TABLE_FILE" >> "$REPORT_PATH"
  cat >> "$REPORT_PATH" <<EOF

## Detailed Results
EOF
  cat "$DETAILS_FILE" >> "$REPORT_PATH"
  write_json_summary

  if [[ $FAILED_CHECKS -gt 0 ]]; then
    echo "harness-package-validation: FAIL ($FAILED_CHECKS checks failed)" >&2
    return 1
  fi

  echo "harness-package-validation: PASS"
  echo "report: $REPORT_PATH"
  echo "summary: $SUMMARY_JSON_PATH"
}

main "$@"
