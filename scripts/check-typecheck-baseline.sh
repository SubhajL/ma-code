#!/usr/bin/env bash
# Runs `npm run typecheck` and fails if the error count exceeds the recorded
# baseline at `.typecheck-baseline-count`. Allows burndown (counts going down)
# but prints a loud warning so the baseline file can be ratcheted down in a
# follow-up PR.
#
# Exit codes:
#   0  count == baseline  (normal pass)
#   0  count <  baseline  (improvement; warning emitted)
#   1  count >  baseline  (regression; fails CI)
#   2  setup error (missing baseline file, npm run typecheck unable to run)

set -euo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BASELINE_FILE="$REPO_ROOT/.typecheck-baseline-count"

if [ ! -f "$BASELINE_FILE" ]; then
  echo "check-typecheck-baseline: missing baseline file $BASELINE_FILE" >&2
  exit 2
fi

BASELINE="$(tr -d '[:space:]' < "$BASELINE_FILE")"

if ! [[ "$BASELINE" =~ ^[0-9]+$ ]]; then
  echo "check-typecheck-baseline: baseline file does not contain an integer: '$BASELINE'" >&2
  exit 2
fi

cd "$REPO_ROOT"

# Capture typecheck output; do NOT propagate non-zero exit from tsc because we
# want to count errors ourselves and compare against the baseline.
TYPECHECK_OUTPUT="$(npm run typecheck 2>&1 || true)"

ACTUAL="$(printf '%s\n' "$TYPECHECK_OUTPUT" | grep -cE 'error TS' || true)"

echo "typecheck error count: $ACTUAL (baseline: $BASELINE)"

if [ "$ACTUAL" -gt "$BASELINE" ]; then
  echo ""
  echo "FAIL: typecheck baseline regression — $ACTUAL > $BASELINE" >&2
  echo "" >&2
  echo "Recent errors:" >&2
  printf '%s\n' "$TYPECHECK_OUTPUT" | grep -E 'error TS' | head -20 >&2
  echo "" >&2
  echo "If the new errors are intentional and approved, update the baseline:" >&2
  echo "  echo $ACTUAL > .typecheck-baseline-count" >&2
  exit 1
fi

if [ "$ACTUAL" -lt "$BASELINE" ]; then
  echo "::warning::typecheck baseline improved — please update .typecheck-baseline-count from $BASELINE to $ACTUAL in a follow-up PR to ratchet the bar down"
fi

echo "typecheck-baseline-ok"
