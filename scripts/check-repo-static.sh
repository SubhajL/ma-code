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
  "scripts/validate-core-workflows.sh"
  ".pi/agent/docs/architecture_review_workflow.md"
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
checks = {
    "planning_lead decision-complete planning": "decision-complete enough" in (root / ".pi/agent/prompts/roles/planning_lead.md").read_text(encoding="utf-8"),
    "orchestrator packet completeness": "goal, non-goals, scope boundaries, validation ideas, and wiring checks" in (root / ".pi/agent/prompts/roles/orchestrator.md").read_text(encoding="utf-8"),
    "quality_lead concrete review scope": "severity-ordered findings" in (root / ".pi/agent/prompts/roles/quality_lead.md").read_text(encoding="utf-8"),
    "reviewer_worker drift review discipline": "intended design vs implemented design" in (root / ".pi/agent/prompts/roles/reviewer_worker.md").read_text(encoding="utf-8"),
    "validator_worker missing validation naming": "specific validation or test still needed" in (root / ".pi/agent/prompts/roles/validator_worker.md").read_text(encoding="utf-8"),
    "build workers skeptical self-review": all("skeptical self-review before handoff" in (root / rel).read_text(encoding="utf-8") for rel in [
        ".pi/agent/prompts/roles/frontend_worker.md",
        ".pi/agent/prompts/roles/backend_worker.md",
        ".pi/agent/prompts/roles/infra_worker.md",
    ]),
    "plan-feature template expanded": "## Discovery Path" in (root / ".pi/agent/prompts/templates/plan-feature.md").read_text(encoding="utf-8"),
    "review-diff template severity section": "## Findings by Severity" in (root / ".pi/agent/prompts/templates/review-diff.md").read_text(encoding="utf-8"),
    "validate-task template discovery section": "## Discovery Path" in (root / ".pi/agent/prompts/templates/validate-task.md").read_text(encoding="utf-8"),
    "architecture review workflow doc": "tactical vs strategic rule" in (root / ".pi/agent/docs/architecture_review_workflow.md").read_text(encoding="utf-8").lower(),
}
missing = [name for name, ok in checks.items() if not ok]
assert not missing, f"missing skill-shaped prompt/doc wiring in: {missing}"
print("repo-static-checks-ok")
PY
