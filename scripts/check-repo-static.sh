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
  "scripts/validate-graphify-discovery.sh"
  "scripts/harness-pr-gate.ts"
  "scripts/harness-sync-main.ts"
  "scripts/validate-prompt-contracts.sh"
  "scripts/validate-prompt-semantics.sh"
  "scripts/validate-prompt-semantics-live.sh"
  ".pi/agent/docs/architecture_review_workflow.md"
  ".pi/agent/docs/graphify_discovery_research.md"
  ".pi/agent/docs/discovery_policy.md"
  ".pi/agent/extensions/discovery-policy.ts"
  "tests/extension-units/discovery-policy.test.ts"
  ".pi/agent/docs/product_planning_workflow.md"
  ".pi/agent/docs/deep_module_refactoring_workflow.md"
  ".pi/agent/docs/tdd_behavior_first_workflow.md"
  ".pi/agent/docs/graphify_adapter.md"
  ".pi/agent/docs/graphify_final_runbook.md"
  ".pi/agent/prompts/templates/request-architecture-review.md"
  ".pi/agent/prompts/templates/assess-drift-capability.md"
  ".pi/agent/prompts/templates/propose-migration-path.md"
  ".pi/agent/validation/prompt-contracts.json"
  ".pi/agent/validation/prompt-semantics.json"
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
import json, pathlib, subprocess, sys
root = pathlib.Path(sys.argv[1])
tracked_runtime = subprocess.check_output(
    [
        "git",
        "-C",
        str(root),
        "ls-files",
        "--",
        ".pi/agent/state/runtime/*.json",
        "logs/harness-actions.jsonl",
    ],
    text=True,
).splitlines()
if tracked_runtime:
    raise AssertionError(
        "Live runtime bookkeeping files must stay local-only and untracked: "
        + ", ".join(tracked_runtime)
    )
for rel in [
    ".pi/agent/models.json",
    ".pi/agent/teams/activation-policy.json",
    ".pi/agent/packets/packet-policy.json",
    ".pi/agent/handoffs/handoff-policy.json",
    ".pi/agent/validation/completion-gate-policy.json",
    ".pi/agent/validation/prompt-contracts.json",
    ".pi/agent/validation/prompt-semantics.json",
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
prompt_semantics_doc = (root / ".pi/agent/docs/validation_architecture.md").read_text(encoding="utf-8")
operator_workflow_doc = (root / ".pi/agent/docs/operator_workflow.md").read_text(encoding="utf-8")
discovery_policy_doc = (root / ".pi/agent/docs/discovery_policy.md").read_text(encoding="utf-8")
orchestrator_prompt = (root / ".pi/agent/prompts/roles/orchestrator.md").read_text(encoding="utf-8")
operator_role_doc = (root / ".pi/agent/docs/operator_role_guide.md").read_text(encoding="utf-8")
graphify_discovery_doc = (root / ".pi/agent/docs/graphify_discovery_research.md").read_text(encoding="utf-8")
graphify_adapter_doc = (root / ".pi/agent/docs/graphify_adapter.md").read_text(encoding="utf-8")
graphify_final_runbook_doc = (root / ".pi/agent/docs/graphify_final_runbook.md").read_text(encoding="utf-8")
architecture_roadmap_alignment_doc = (root / ".pi/agent/docs/architecture_roadmap_alignment.md").read_text(encoding="utf-8")
product_planning_doc = (root / ".pi/agent/docs/product_planning_workflow.md").read_text(encoding="utf-8")
deep_module_doc = (root / ".pi/agent/docs/deep_module_refactoring_workflow.md").read_text(encoding="utf-8")
tdd_behavior_doc = (root / ".pi/agent/docs/tdd_behavior_first_workflow.md").read_text(encoding="utf-8")
g_coding_skill = (root / "packages/pi-g-skills/skills/g-coding/SKILL.md").read_text(encoding="utf-8")
planning_lead_prompt = (root / ".pi/agent/prompts/roles/planning_lead.md").read_text(encoding="utf-8")
research_worker_prompt = (root / ".pi/agent/prompts/roles/research_worker.md").read_text(encoding="utf-8")
gitignore_doc = (root / ".gitignore").read_text(encoding="utf-8")
package_manifest = json.loads((root / ".pi/agent/package/harness-package.json").read_text(encoding="utf-8"))
core_workflows_validator = (root / "scripts/validate-core-workflows.sh").read_text(encoding="utf-8")
graphify_validator = (root / "scripts/validate-graphify-discovery.sh").read_text(encoding="utf-8")
reviewer_prompt = (root / ".pi/agent/prompts/roles/reviewer_worker.md").read_text(encoding="utf-8")
validator_prompt = (root / ".pi/agent/prompts/roles/validator_worker.md").read_text(encoding="utf-8")
review_template = (root / ".pi/agent/prompts/templates/review-diff.md").read_text(encoding="utf-8")
validate_template = (root / ".pi/agent/prompts/templates/validate-task.md").read_text(encoding="utf-8")
discovery_policy_extension = (root / ".pi/agent/extensions/discovery-policy.ts").read_text(encoding="utf-8")
graphify_validation_decision_extension = (root / ".pi/agent/extensions/graphify-validation-decision.ts").read_text(encoding="utf-8")
graphify_orchestration_decision_extension = (root / ".pi/agent/extensions/graphify-orchestration-decision.ts").read_text(encoding="utf-8")
extension_unit_validator = (root / "scripts/validate-extension-unit-tests.sh").read_text(encoding="utf-8")
foundation_compile_validator = (root / "scripts/check-foundation-extension-compile.sh").read_text(encoding="utf-8")
pr_gate_helper = (root / "scripts/harness-pr-gate.ts").read_text(encoding="utf-8")
package_json = json.loads((root / "package.json").read_text(encoding="utf-8"))
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
for needle in [
    "scripts/validate-prompt-semantics.sh",
    "scripts/validate-prompt-semantics-live.sh",
    ".pi/agent/validation/prompt-semantics.json",
]:
    assert needle in file_map_doc
    assert needle in readme_doc
    assert needle in prompt_semantics_doc
for needle in [
    "Canonical discovery policy: `.pi/agent/docs/discovery_policy.md`",
    "Auggie",
    "Graphify",
    "local read/rg/find",
    "Exa",
    "Use Auggie first for bounded repo-local semantic discovery",
    "Use Graphify for broad repo/corpus structure discovery",
    "Use local read/rg/find for exact verification",
    "Use Exa for current external web information",
]:
    assert needle in discovery_policy_doc
for needle in [
    ".pi/agent/docs/discovery_policy.md",
    "Canonical discovery policy",
]:
    assert needle in orchestrator_prompt
    assert needle in operator_workflow_doc
    assert needle in file_map_doc
for needle in [
    "selectDiscoveryPolicy",
    "select_discovery_policy",
    "repo_semantic",
    "broad_structure",
    "exact_verification",
    "external_current_info",
]:
    assert needle in discovery_policy_extension
for needle in [
    ".pi/agent/extensions/discovery-policy.ts",
    "select_discovery_policy",
    "tests/extension-units/discovery-policy.test.ts",
    "scripts/validate-extension-unit-tests.sh",
]:
    assert needle in discovery_policy_doc
for needle in [
    ".pi/agent/extensions/discovery-policy.ts",
    "select_discovery_policy",
]:
    assert needle in operator_workflow_doc
    assert needle in validation_doc
for needle in [
    ".pi/agent/extensions/discovery-policy.ts",
    "tests/extension-units/discovery-policy.test.ts",
]:
    assert needle in file_map_doc
assert "discovery-policy.ts" in extension_unit_validator
assert "discovery-policy.test.ts" in extension_unit_validator
assert "discovery-policy.ts" in foundation_compile_validator
assert "graphify-validation-decision.ts" in extension_unit_validator
assert "graphify-validation-decision.test.ts" in extension_unit_validator
assert "graphify-validation-decision.ts" in foundation_compile_validator
assert "graphify-orchestration-decision.ts" in extension_unit_validator
assert "graphify-orchestration-decision.test.ts" in extension_unit_validator
assert "graphify-orchestration-decision.ts" in foundation_compile_validator
for needle in [
    "decideGraphifyOrchestration",
    "GRAPHIFY_ORCHESTRATION_ACTIONS",
    "GraphifyOrchestrationDecisionInput",
    "GraphifyOrchestrationDecision",
    "run_preflight",
    "request_approval",
    "run_scan",
    "query_graph",
    "verify_sources",
    "ready",
]:
    assert needle in graphify_orchestration_decision_extension
assert "test:discovery-policy" in package_json.get("scripts", {})
architecture_boundary_needles = [
    "## Architecture Boundary Map",
    "Tactical Graphify adapter support is bounded discovery infrastructure, not global architecture authority.",
    "Runtime validation enforcement is implemented through task validation/completion gates, not through Graphify scans alone.",
    "Policy-gated mandatory Graphify use is optional_default by default and scoped to Graphify-backed or architecture-review claims only when explicitly requested.",
    "Bounded watch/session mode means foreground queue-session execution with max steps, max runtime seconds, explicit task id or scope, visible logs, and no Graphify CLI --watch.",
    "Future roadmap gaps remain explicit: no free-running queue daemon, no hidden scheduled loop, no global mandatory Graphify dependency, and no hands-free Phase I/Phase J autonomy claim.",
]
for needle in architecture_boundary_needles:
    assert needle in architecture_roadmap_alignment_doc, f"architecture_roadmap_alignment.md missing boundary language: {needle}"
for doc_name, doc_text in [
    ("README.md", readme_doc),
    ("validation_architecture.md", validation_doc),
    ("operator_workflow.md", operator_workflow_doc),
    ("bounded_autonomy_architecture.md", (root / ".pi/agent/docs/bounded_autonomy_architecture.md").read_text(encoding="utf-8")),
    ("graphify_adapter.md", graphify_adapter_doc),
]:
    assert ".pi/agent/docs/architecture_roadmap_alignment.md" in doc_text, f"{doc_name} missing architecture roadmap alignment doc reference"
for prompt_name, prompt_text in [
    ("orchestrator.md", orchestrator_prompt),
    ("planning_lead.md", planning_lead_prompt),
    ("reviewer_worker.md", reviewer_prompt),
    ("validator_worker.md", validator_prompt),
]:
    assert ".pi/agent/docs/architecture_roadmap_alignment.md" in prompt_text, f"{prompt_name} missing architecture roadmap alignment doc reference"
assert ".pi/agent/docs/architecture_roadmap_alignment.md" in file_map_doc
for needle in [
    "optional_default",
    "required_for_graphify_backed_claims",
    "required_for_architecture_review",
    "disabled",
    "GraphifyValidationPolicy",
    "GraphifyClaimScope",
]:
    assert needle in graphify_validation_decision_extension
for needle in [
    "Graphify is an optional discovery fallback, not a required harness dependency.",
    "Graphify is not a live web-search replacement for Exa.",
    "Graphify should be run by research/system-analysis lanes and consumed by planning lanes.",
]:
    assert needle in graphify_discovery_doc
    assert needle in operator_workflow_doc
    assert needle in operator_role_doc
    assert needle in planning_lead_prompt
    assert needle in research_worker_prompt
for needle in [
    "Product planning flows from grill-style clarification to PRD to vertical-slice backlog.",
    "Vertical slices must be independently demonstrable or verifiable.",
]:
    assert needle in product_planning_doc
    assert needle in operator_workflow_doc
for needle in [
    "Use behavior-first TDD: one failing behavior test, one minimal implementation, then repeat.",
    "Do not batch speculative tests ahead of implementation.",
    "Mock only system boundaries by default.",
]:
    assert needle in tdd_behavior_doc
    assert needle in g_coding_skill
for needle in [
    "The interface is the test surface.",
    "Use the deletion test to distinguish shallow modules from deep modules.",
]:
    assert needle in deep_module_doc
for needle in [
    "## How to Read This Report",
    "## Final Decision",
    "Operator Next Step",
    "graphify-validation-decision.ts",
]:
    assert needle in core_workflows_validator
for needle in [
    "No auto-install",
    ".pi/agent/artifacts/graphify/<task-id>/",
    "Large corpus scans require explicit approval",
    "--watch",
    "--mcp",
    "--neo4j-push",
    "not a live web-search replacement",
    "## Manual tiny-fixture smoke",
    "run the adapter against a tiny fixture repo",
    "git status --short --ignored=matching",
    "generated report/artifact files stay out of the source diff",
]:
    assert needle in graphify_adapter_doc
assert ".pi/agent/artifacts/" in gitignore_doc
for needle in [
    ".pi/agent/state/runtime/*.json",
    ".pi/agent/state/runtime/*.lock",
    "logs/harness-actions.jsonl",
]:
    assert needle in gitignore_doc
assert ".pi/agent/artifacts" in package_manifest.get("excludedPaths", [])
assert ".pi/agent/state/runtime" in package_manifest.get("excludedPaths", [])
assert "harness:pr-gate" in package_json.get("scripts", {})
assert "test:pr-gate" in package_json.get("scripts", {})
assert "harness:sync-main" in package_json.get("scripts", {})
assert "test:sync-main" in package_json.get("scripts", {})
for needle in [
    "gh pr checks",
    "--watch",
    "DEFAULT_INTERVAL_SECONDS = 180",
    "recommendedNextAction",
]:
    assert needle in pr_gate_helper
sync_main_helper = (root / "scripts/harness-sync-main.ts").read_text(encoding="utf-8")
for needle in [
    "syncLocalMain",
    "merge",
    "--ff-only",
    "non-bookkeeping tracked dirt",
    "preservedLocalBookkeeping",
]:
    assert needle in sync_main_helper
for needle in [
    "harness:pr-gate",
    "180 seconds",
]:
    assert needle in readme_doc
    assert needle in operator_workflow_doc
for needle in [
    "harness:sync-main",
    "fast-forward",
    "runtime bookkeeping",
]:
    assert needle in readme_doc
    assert needle in operator_workflow_doc
for needle in [
    "scripts/harness-pr-gate.ts",
    "scripts/harness-sync-main.ts",
]:
    assert needle in file_map_doc
    assert needle in validation_doc
assert "validate:graphify-discovery" in package_json.get("scripts", {})
for needle in [
    "scripts/validate-graphify-discovery.sh",
    "validate:graphify-discovery",
    "canonical Graphify validator",
]:
    assert needle in readme_doc
    assert needle in validation_doc
for needle in [
    "discovery-policy.ts",
    "discovery-policy.test.ts",
    "check_5_discovery_policy_selector_unit_tests",
    "graphify-validation-decision.ts",
    "graphify-validation-decision.test.ts",
    "check_6_graphify_validation_decision_unit_tests",
    "graphify-orchestration-decision.ts",
    "graphify-orchestration-decision.test.ts",
    "check_7_graphify_orchestration_decision_unit_tests",
]:
    assert needle in graphify_validator
for needle in [
    "check_8_graphify_validator_coverage_contract",
    "discovery selector Graphify recommendation",
    "Graphify adapter purpose requirement",
    "Graphify adapter preflight token requirement",
    "freshness/cadence helper",
    "final-validation prompt language",
]:
    assert needle in graphify_validator
for needle in [
    "discovery-policy selector tests for Graphify fallback choices",
    "discovery-policy Graphify fallback selection",
]:
    assert needle in validation_doc
for needle in [
    "discovery-policy selector tests for Graphify fallback choices",
]:
    assert needle in operator_workflow_doc
for needle in [
    "./scripts/validate-graphify-discovery.sh",
    "--smoke",
]:
    assert needle in operator_workflow_doc
for needle in [
    "scripts/validate-graphify-discovery.sh",
    ".pi/agent/docs/graphify_final_runbook.md",
]:
    assert needle in file_map_doc
for needle in [
    ".pi/agent/docs/graphify_final_runbook.md",
    "Final operator runbook",
]:
    assert needle in graphify_adapter_doc
for needle in [
    "# Graphify Final Runbook",
    "## Final Operator Checklist",
    "1. Confirm Graphify is optional and appropriate",
    "2. Run preflight before scan",
    "3. Run a bounded scan only after approval gates pass",
    "4. Check freshness/cadence before reuse",
    "5. Query and verify before planning or acceptance",
    "6. Record evidence and cleanup boundaries",
    "Do not use Graphify as a live web-search replacement",
    "Do not commit generated Graphify artifacts",
    "bash scripts/validate-graphify-discovery.sh",
]:
    assert needle in graphify_final_runbook_doc

required_graphify_final_validation_rule = "Graphify-backed acceptance cannot pass unless the latest relevant graph was queried or freshness/cadence was checked, and important claims were verified with direct source inspection."
required_graphify_final_validation_needles = [
    required_graphify_final_validation_rule,
    "latest relevant graph was queried or freshness/cadence was checked",
    "important claims were verified with direct source inspection",
]
for doc_name, doc_text in [
    ("validator_worker.md", validator_prompt),
    ("reviewer_worker.md", reviewer_prompt),
    ("graphify_final_runbook.md", graphify_final_runbook_doc),
    ("operator_workflow.md", operator_workflow_doc),
]:
    for needle in required_graphify_final_validation_needles:
        assert needle in doc_text, f"{doc_name} missing Graphify final-validation rule text: {needle}"
for needle in [
    "Graphify final runbook",
    ".pi/agent/docs/graphify_final_runbook.md",
]:
    assert needle in validation_doc
for needle in [
    "Scan validator reports in this order:",
    "Summary Table",
    "Final Decision",
    "Detailed Results",
]:
    assert needle in operator_workflow_doc
    assert needle in prompt_semantics_doc
PY

"$REPO_ROOT/scripts/validate-prompt-contracts.sh"

echo "repo-static-checks-ok"
