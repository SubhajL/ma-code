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
  "scripts/validate-prompt-contracts.sh"
  ".pi/agent/docs/architecture_review_workflow.md"
  ".pi/agent/prompts/templates/request-architecture-review.md"
  ".pi/agent/prompts/templates/assess-drift-capability.md"
  ".pi/agent/prompts/templates/propose-migration-path.md"
  ".pi/agent/validation/prompt-contracts.json"
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
    ".pi/agent/validation/prompt-contracts.json",
    ".pi/agent/state/schemas/tasks.schema.json",
    ".pi/agent/state/schemas/queue.schema.json",
    ".pi/agent/state/schemas/task-packet.schema.json",
    ".pi/agent/state/schemas/handoff.schema.json",
    "package.json",
    "packages/pi-g-skills/package.json",
]:
    with (root / rel).open("r", encoding="utf-8") as f:
        json.load(f)
workflow_doc = (root / ".pi/agent/docs/architecture_review_workflow.md").read_text(encoding="utf-8")
validation_doc = (root / ".pi/agent/docs/validation_architecture.md").read_text(encoding="utf-8")
file_map_doc = (root / ".pi/agent/docs/file_map.md").read_text(encoding="utf-8")
readme_doc = (root / "README.md").read_text(encoding="utf-8")
validation_recovery_doc = (root / ".pi/agent/docs/validation_recovery_architecture.md").read_text(encoding="utf-8")
operator_role_doc = (root / ".pi/agent/docs/operator_role_guide.md").read_text(encoding="utf-8")
reviewer_prompt = (root / ".pi/agent/prompts/roles/reviewer_worker.md").read_text(encoding="utf-8")
validator_prompt = (root / ".pi/agent/prompts/roles/validator_worker.md").read_text(encoding="utf-8")
review_template = (root / ".pi/agent/prompts/templates/review-diff.md").read_text(encoding="utf-8")
validate_template = (root / ".pi/agent/prompts/templates/validate-task.md").read_text(encoding="utf-8")
assert "tactical vs strategic rule" in workflow_doc.lower()
for needle in [
    "request-architecture-review.md",
    "assess-drift-capability.md",
    "propose-migration-path.md",
]:
    assert needle in workflow_doc
    assert needle in validation_doc
    assert needle in file_map_doc
    assert needle in readme_doc
review_needles = [
    "Severity Buckets: CRITICAL | HIGH | MEDIUM | LOW",
    "Severity Summary: CRITICAL=<n> HIGH=<n> MEDIUM=<n> LOW=<n>",
    "Required Fix Item Fields: severity | summary | file_ref | fix_direction | validation_needed",
    "Optional Improvement Item Fields: summary | file_ref | benefit | follow_up",
]
for needle in review_needles:
    assert needle in reviewer_prompt
    assert needle in review_template
    assert needle in validation_recovery_doc
    assert needle in operator_role_doc
validator_needles = [
    "Proof Status: sufficient | partial | missing | contradictory",
    "Missing Proof Category: none | acceptance_gap | evidence_missing | validation_missing | wiring_unchecked | blocked_dependency | contradictory_evidence",
    "Missing Proof Item Fields: category | gap | evidence_needed | blocking_effect",
    "Decision Basis: proof_sufficient | proof_gap | blocked_dependency",
]
for needle in validator_needles:
    assert needle in validator_prompt
    assert needle in validate_template
    assert needle in validation_recovery_doc
    assert needle in operator_role_doc
PY

"$REPO_ROOT/scripts/validate-prompt-contracts.sh"

echo "repo-static-checks-ok"
