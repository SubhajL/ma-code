#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

required_files=(
  "AGENTS.md"
  "README.md"
  "SYSTEM.md"
  "package.json"
  ".pi/agent/models.json"
  ".pi/agent/teams/activation-policy.json"
  ".pi/agent/packets/packet-policy.json"
  ".pi/agent/handoffs/handoff-policy.json"
  ".pi/agent/validation/completion-gate-policy.json"
  ".pi/agent/state/schemas/tasks.schema.json"
  ".pi/agent/state/schemas/queue.schema.json"
  ".pi/agent/state/schemas/task-packet.schema.json"
  ".pi/agent/state/schemas/handoff.schema.json"
  "scripts/validate-phase-a-b.sh"
  "scripts/validate-queue-semantics.sh"
  "scripts/validate-skill-routing.sh"
  "scripts/validate-harness-routing.sh"
  "scripts/validate-team-activation.sh"
  "scripts/validate-task-packets.sh"
  "scripts/validate-handoffs.sh"
  "scripts/validate-same-runtime-bridge.sh"
  "scripts/validate-recovery-policy.sh"
  "scripts/validate-recovery-runtime.sh"
  "scripts/validate-queue-runner.sh"
  ".github/workflows/ci.yml"
  ".github/workflows/security.yml"
  ".github/dependabot.yml"
  ".github/CODEOWNERS"
  ".github/pull_request_template.md"
)

for path in "${required_files[@]}"; do
  if [[ ! -f "$REPO_ROOT/$path" ]]; then
    echo "Missing required file: $path" >&2
    exit 1
  fi
done

bash -n "$REPO_ROOT"/scripts/*.sh

"${PYTHON_BIN:-python3}" - <<'PY' "$REPO_ROOT"
import json, pathlib, sys
root = pathlib.Path(sys.argv[1])
for rel in [
    ".pi/agent/models.json",
    ".pi/agent/teams/activation-policy.json",
    ".pi/agent/packets/packet-policy.json",
    ".pi/agent/handoffs/handoff-policy.json",
    ".pi/agent/validation/completion-gate-policy.json",
    ".pi/agent/state/schemas/tasks.schema.json",
    ".pi/agent/state/schemas/queue.schema.json",
    ".pi/agent/state/schemas/task-packet.schema.json",
    ".pi/agent/state/schemas/handoff.schema.json",
    "package.json",
    "packages/pi-g-skills/package.json",
]:
    with (root / rel).open("r", encoding="utf-8") as f:
        json.load(f)
print("repo-static-checks-ok")
PY
