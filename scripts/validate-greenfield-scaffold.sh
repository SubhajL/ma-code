#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "$0")/.." && pwd)"
DRY_RUN=0
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=1
  shift
fi
if [[ $# -gt 0 ]]; then
  echo "Usage: ./scripts/validate-greenfield-scaffold.sh [--dry-run]" >&2
  exit 2
fi

ISSUE_SUMMARY_REL="docs/initiatives/greenfield-scaffold/slices/issue-016.summary.json"
COMMANDS=(
  "npm run validate:greenfield-scaffold:unit"
  "npm run validate:greenfield-scaffold:integration"
  "npm run validate:greenfield-scaffold:smoke"
)

has_npm_script() {
  local script_name="$1"
  node --input-type=module -e 'import { readFileSync } from "node:fs"; const pkg = JSON.parse(readFileSync(process.argv[1], "utf8")); process.exit(pkg.scripts && pkg.scripts[process.argv[2]] ? 0 : 1);' "$ROOT_DIR/package.json" "$script_name"
}

validate_contract() {
  local command="$1"
  if [[ "$command" == npm\ run\ * ]]; then
    local remainder="${command#npm run }"
    local script_name="${remainder%% *}"
    if ! has_npm_script "$script_name"; then
      echo "Missing npm script '$script_name' required by: $command" >&2
      return 1
    fi
    return 0
  fi
  if [[ "$command" == ./* ]]; then
    local rel="${command%% *}"
    if [[ ! -x "$ROOT_DIR/$rel" ]]; then
      echo "Missing executable '$rel' required by: $command" >&2
      return 1
    fi
    return 0
  fi
  echo "Unsupported validation command contract: $command" >&2
  return 1
}

validate_phase_a_queue_readiness() {
  node --input-type=module -e 'import { readFileSync } from "node:fs"; const summary = JSON.parse(readFileSync(process.argv[1], "utf8")); const expected = process.argv[2]; if (summary.queueReadiness !== expected) { console.error(`Expected ${process.argv[1]} queueReadiness=${expected} but found ${summary.queueReadiness ?? "<missing>"}`); process.exit(1); }' "$ROOT_DIR/$ISSUE_SUMMARY_REL" "not_ready"
}

for command in "${COMMANDS[@]}"; do
  validate_contract "$command"
done
validate_phase_a_queue_readiness

if [[ "$DRY_RUN" -eq 1 ]]; then
  printf 'greenfield-scaffold validation plan\n'
  for command in "${COMMANDS[@]}"; do
    printf -- '- %s\n' "$command"
  done
  exit 0
fi

cd "$ROOT_DIR"
for command in "${COMMANDS[@]}"; do
  echo "> $command"
  eval "$command"
done
