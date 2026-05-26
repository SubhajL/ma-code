#!/usr/bin/env bash
# check-no-frontier-literals.sh — Tier 2 §8 keystone enforcement.
#
# Forbids hard-coded frontier model ID literals (claude-opus-4-7, gpt-5.5,
# gpt-5.3-codex-spark, etc.) anywhere in the repo except an allowlist of
# paths that are domain-legitimate sources of model IDs:
#
#   - .pi/agent/models.json: the canonical source of truth for capabilities
#     and per-role defaults.
#   - .pi/agent/package/templates/models.template.json: scaffold copy;
#     queued for separate migration.
#   - .pi/settings.json: repo-local Pi provider/default model config.
#   - .pi/agent/docs/**, .pi/agent/routing/**: routing guide docs that name
#     current models for human context.
#   - scripts/validate-*.sh, scripts/check-repo-static.sh,
#     scripts/collect-harness-tuning-data.sh: validator fixtures, cost
#     tables, contract assertions.
#   - tests/**: regression fixtures that assert specific expansions.
#   - .pi/agent/state/runtime/**: archived runtime queue/task state; SQLite is
#     the live source (Tier 1 §1, PRs #192-#198), JSON files are post-migration
#     historical evidence.
#   - coding-logs/**, logs/**, reports/**, docs/**: append-only history.
#   - packages/**: separate package release cycle (outside Tier 2 §8 scope).
#   - README.md, ma-code-devlogs.md: top-level history.
#
# Exit codes:
#   0  no unexpected frontier literals found
#   1  at least one unexpected frontier literal (printed to stderr)
#
# Usage:
#   ./scripts/check-no-frontier-literals.sh            # scans repo root
#   ./scripts/check-no-frontier-literals.sh --root DIR # scans DIR (for tests)

set -euo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT_DEFAULT="$(cd "$SCRIPT_DIR/.." && pwd)"

ROOT="$REPO_ROOT_DEFAULT"
if [ $# -gt 0 ]; then
  if [ "$1" = "--root" ] && [ $# -ge 2 ]; then
    ROOT="$2"
  else
    echo "Usage: $0 [--root DIR]" >&2
    exit 2
  fi
fi

# Frontier model literal pattern. Matches:
#   - provider-qualified IDs:  anthropic/claude-opus-4-7, openai-codex/gpt-5.5,
#                              github-copilot/gpt-5.4-mini
#   - quoted bare IDs:         "gpt-5.3-codex-spark", 'claude-sonnet-4-6'
# Does NOT match capability names like routing_reasoning_first, strong_reasoning,
# or words like "strong"/"fallback".
MODEL_RE='(anthropic/claude-(opus|sonnet|haiku)-[0-9][0-9A-Za-z_.-]*|(openai-codex|github-copilot)/gpt-[0-9][0-9A-Za-z_.-]*|["'"'"'`](gpt-[0-9][0-9A-Za-z_.-]*|claude-(opus|sonnet|haiku)-[0-9][0-9A-Za-z_.-]*)["'"'"'`])'

is_allowed_path() {
  local rel="$1"
  case "$rel" in
    .pi/agent/models.json) return 0 ;;
    .pi/agent/package/templates/models.template.json) return 0 ;;
    .pi/settings.json) return 0 ;;
    .pi/agent/docs/*) return 0 ;;
    .pi/agent/routing/*) return 0 ;;
    .pi/agent/state/runtime/*) return 0 ;;
    scripts/check-repo-static.sh) return 0 ;;
    scripts/check-no-frontier-literals.sh) return 0 ;;
    scripts/validate-*.sh) return 0 ;;
    scripts/collect-harness-tuning-data.sh) return 0 ;;
    tests/*) return 0 ;;
    coding-logs/*) return 0 ;;
    logs/*) return 0 ;;
    reports/*) return 0 ;;
    docs/*) return 0 ;;
    packages/*) return 0 ;;
    README.md) return 0 ;;
    ma-code-devlogs.md) return 0 ;;
  esac
  return 1
}

# Use grep -RInE for line numbers; suppress non-zero exit when there are no
# matches at all (we want to inspect each hit, not fail the pipeline).
violations=()
while IFS= read -r hit; do
  [ -z "$hit" ] && continue
  rel="${hit#"$ROOT"/}"
  file="${rel%%:*}"
  if ! is_allowed_path "$file"; then
    violations+=("$rel")
  fi
done < <(
  grep -RInE \
    --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' --include='*.cjs' \
    --include='*.sh' --include='*.json' --include='*.md' --include='*.py' \
    --exclude-dir='.git' --exclude-dir='node_modules' --exclude-dir='dist' --exclude-dir='build' \
    "$MODEL_RE" "$ROOT" 2>/dev/null || true
)

if [ "${#violations[@]}" -gt 0 ]; then
  printf 'Unexpected frontier model literal(s) outside the allowlist:\n' >&2
  printf '  %s\n' "${violations[@]}" >&2
  printf '\nIf this literal is domain-legitimate (test fixture, cost table, doc), add the path to the allowlist in scripts/check-no-frontier-literals.sh. Otherwise, replace with a capability ref via resolveHarnessCapability().\n' >&2
  exit 1
fi

echo "no-frontier-literals-ok"
