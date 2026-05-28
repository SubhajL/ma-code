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
  ".pi/agent/state/schemas/leases.schema.json"
  ".pi/agent/state/schemas/lifecycle-evidence.schema.json"
  ".pi/agent/state/schemas/product-slice-plan.schema.json"
  ".pi/agent/state/schemas/stitch-screen-artifact.schema.json"
  ".pi/agent/state/schemas/live-stitch-artifact.schema.json"
  ".pi/agent/state/schemas/screen-artifact-approval.schema.json"
  ".pi/agent/state/schemas/slice-contract.schema.json"
  ".pi/agent/state/schemas/frontend-validation-evidence.schema.json"
  ".pi/agent/state/schemas/slice-dependency-decision.schema.json"
  ".pi/agent/package/templates/runtime/leases.json"
  ".pi/agent/extensions/execution-leases.ts"
  ".pi/agent/extensions/slice-lifecycle.ts"
  ".pi/agent/extensions/product-slice-lifecycle.ts"
  ".pi/agent/extensions/stitch.ts"
  ".pi/agent/extensions/stitch-prompt-generator.ts"
  ".pi/agent/extensions/stitch-artifact-adapter.ts"
  ".pi/agent/extensions/live-stitch-adapter.ts"
  ".pi/agent/extensions/screen-artifact-approval.ts"
  ".pi/agent/extensions/slice-contracts.ts"
  ".pi/agent/extensions/packets.ts"
  ".pi/agent/extensions/frontend-packet-generator.ts"
  ".pi/agent/extensions/backend-packet-generator.ts"
  ".pi/agent/extensions/slice-dependency-decision.ts"
  ".pi/agent/extensions/product-pipeline.ts"
  ".pi/agent/state/schemas/product-pipeline.schema.json"
  ".pi/agent/extensions/afk-orchestration.ts"
  ".pi/agent/state/schemas/afk-orchestration-run.schema.json"
  ".pi/agent/docs/afk_queue_orchestration.md"
  "scripts/harness-afk-orchestrate.ts"
  ".pi/agent/extensions/orchestrator-classifier.ts"
  ".pi/agent/extensions/orchestrator-dry-run.ts"
  ".pi/agent/extensions/orchestrator-apply-policy.ts"
  ".pi/agent/extensions/orchestrator-run.ts"
  ".pi/agent/extensions/orchestrator-continue.ts"
  ".pi/agent/extensions/orchestrator-evidence.ts"
  ".pi/agent/state/schemas/orchestrator-evidence.schema.json"
  ".pi/agent/docs/master_orchestrator.md"
  "scripts/harness-orchestrate.ts"
  "scripts/validate-orchestrator-classifier.sh"
  "scripts/validate-orchestrator-dry-run.sh"
  "scripts/validate-orchestrator-apply.sh"
  "scripts/validate-orchestrator-run.sh"
  "scripts/validate-orchestrator-continue.sh"
  "scripts/validate-orchestrator-evidence.sh"
  "tests/extension-units/orchestrator-classifier.test.ts"
  "tests/extension-units/orchestrator-dry-run.test.ts"
  "tests/extension-units/orchestrator-apply-policy.test.ts"
  "tests/extension-units/orchestrator-run.test.ts"
  "tests/extension-units/orchestrator-continue.test.ts"
  "tests/extension-units/orchestrator-evidence.test.ts"
  "tests/integration/orchestrator-classifier.test.ts"
  "tests/integration/orchestrator-dry-run.test.ts"
  "tests/integration/orchestrator-apply.test.ts"
  "tests/integration/orchestrator-run.test.ts"
  "tests/integration/orchestrator-continue.test.ts"
  "tests/integration/orchestrator-evidence.test.ts"
  "scripts/validate-afk-orchestration.sh"
  "tests/extension-units/afk-orchestration.test.ts"
  "tests/integration/afk-orchestration.test.ts"
  "tests/extension-units/execution-leases.test.ts"
  "tests/extension-units/consolidated-modules.test.ts"
  "tests/extension-units/product-slice-lifecycle.test.ts"
  "tests/extension-units/stitch-prompt-generator.test.ts"
  "tests/extension-units/stitch-artifact-adapter.test.ts"
  "tests/extension-units/live-stitch-adapter.test.ts"
  "tests/extension-units/screen-artifact-approval.test.ts"
  "tests/extension-units/slice-contracts.test.ts"
  "tests/extension-units/frontend-packet-generator.test.ts"
  "tests/extension-units/backend-packet-generator.test.ts"
  "tests/extension-units/slice-dependency-decision.test.ts"
  "tests/extension-units/product-pipeline.test.ts"
  "scripts/validate-phase-a-b.sh"
  "scripts/validate-queue-semantics.sh"
  "scripts/validate-skill-routing.sh"
  "scripts/validate-harness-routing.sh"
  "scripts/validate-team-activation.sh"
  "scripts/validate-task-packets.sh"
  "scripts/validate-handoffs.sh"
  "scripts/validate-same-runtime-bridge.sh"
  ".pi/agent/extensions/recovery.ts"
  "scripts/validate-recovery-policy.sh"
  "scripts/validate-recovery-runtime.sh"
  "scripts/validate-queue-runner.sh"
  "scripts/validate-core-workflows.sh"
  "scripts/validate-graphify-discovery.sh"
  "scripts/validate-product-slice-lifecycle.sh"
  "scripts/validate-stitch-prompts.sh"
  "scripts/validate-stitch-artifacts.sh"
  "scripts/validate-live-stitch-artifacts.sh"
  "scripts/validate-screen-artifact-approval.sh"
  "scripts/validate-slice-contracts.sh"
  "scripts/validate-frontend-packets.sh"
  "scripts/validate-backend-packets.sh"
  "scripts/validate-slice-dependencies.sh"
  "scripts/harness-slice-dependencies.ts"
  "scripts/validate-product-pipeline.sh"
  "scripts/validate-product-pipeline-e2e.sh"
  "scripts/validate-afk-orchestration.sh"
  "tests/integration/product-pipeline-e2e.test.ts"
  "tests/fixtures/product-pipeline-e2e/checkout-mini/README.md"
  "tests/fixtures/product-pipeline-e2e/checkout-mini/expected-artifacts.json"
  ".pi/agent/docs/product_pipeline_e2e_pilot.md"
  "scripts/harness-fe-packet.ts"
  "scripts/harness-be-packet.ts"
  "scripts/harness-product-pipeline.ts"
  "scripts/harness-pr-gate.ts"
  "scripts/harness-sync-main.ts"
  "scripts/harness-init-feature.ts"
  "tests/integration/harness-init-feature.test.ts"
  "scripts/harness-product-intake.ts"
  "tests/integration/harness-product-intake.test.ts"
  "scripts/harness-stitch-prompt.ts"
  "tests/integration/stitch-prompt.test.ts"
  "scripts/harness-stitch-artifact.ts"
  "scripts/harness-live-stitch-artifact.ts"
  "tests/integration/stitch-artifact.test.ts"
  "tests/integration/live-stitch-artifact.test.ts"
  "scripts/harness-screen-approval.ts"
  "scripts/harness-slice-contract.ts"
  "tests/integration/screen-artifact-approval.test.ts"
  "tests/integration/slice-contracts.test.ts"
  "tests/integration/frontend-packet-generator.test.ts"
  "tests/integration/backend-packet-generator.test.ts"
  "tests/integration/slice-dependency-decision.test.ts"
  "tests/integration/product-pipeline.test.ts"
  "scripts/validate-prompt-contracts.sh"
  "scripts/validate-prompt-semantics.sh"
  "scripts/validate-prompt-semantics-live.sh"
  ".pi/agent/docs/architecture_review_workflow.md"
  ".pi/agent/docs/graphify_discovery_research.md"
  ".pi/agent/docs/discovery_policy.md"
  ".pi/agent/extensions/discovery-policy.ts"
  "tests/extension-units/discovery-policy.test.ts"
  ".pi/agent/docs/product_planning_workflow.md"
  ".pi/agent/docs/product_slice_lifecycle.md"
  ".pi/agent/docs/stitch_prompt_generation.md"
  ".pi/agent/docs/stitch_artifacts.md"
  ".pi/agent/docs/live_stitch_adapter.md"
  ".pi/agent/docs/screen_artifact_approval.md"
  ".pi/agent/docs/slice_contracts.md"
  ".pi/agent/docs/frontend_packet_generation.md"
  ".pi/agent/docs/backend_packet_generation.md"
  ".pi/agent/docs/slice_dependency_decision.md"
  ".pi/agent/docs/product_pipeline_runtime.md"
  ".pi/agent/docs/parallel_worker_lanes.md"
  ".pi/agent/extensions/parallel-worker-lanes.ts"
  ".pi/agent/state/schemas/parallel-worker-lanes.schema.json"
  "scripts/harness-parallel-worker-lanes.ts"
  "scripts/validate-parallel-worker-lanes.sh"
  "tests/extension-units/parallel-worker-lanes.test.ts"
  "tests/integration/parallel-worker-lanes.test.ts"
  ".pi/agent/docs/phase_model_routing.md"
  ".pi/agent/docs/deep_module_refactoring_workflow.md"
  ".pi/agent/docs/tdd_behavior_first_workflow.md"
  "packages/pi-g-skills/README.md"
  "packages/pi-g-skills/docs/porting-matrix.md"
  "packages/pi-g-skills/skills/g-grill/SKILL.md"
  "packages/pi-g-skills/skills/g-prd/SKILL.md"
  "packages/pi-g-skills/skills/g-issues/SKILL.md"
  "packages/pi-g-skills/skills/g-refactor/SKILL.md"
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
  "docs/initiatives/TEMPLATE/slice-plan.json"
  "docs/adr/README.md"
  "docs/adr/TEMPLATE.md"
  "docs/adr/0001-runtime-state-is-sqlite.md"
  "docs/adr/0002-bounded-autonomy.md"
  "docs/adr/0003-atomic-queue-task-mutations.md"
  "docs/adr/0004-apps-web-and-services-api-are-harness-fixtures.md"
  "docs/adr/0005-typed-control-plane-kernel.md"
  "docs/adr/0006-sqlite-as-real-domain-store.md"
  "docs/adr/0007-typed-validator-report-contract.md"
  "docs/adr/0008-rich-schema-per-validator-emitters.md"
  "docs/adr/0009-skip-live-flag-convention.md"
  ".pi/agent/docs/harness_runbook.md"
  "apps/web/README.md"
  "services/api/README.md"
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
        "logs/harness-actions.jsonl*",
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
    ".pi/agent/state/schemas/leases.schema.json",
    ".pi/agent/state/schemas/lifecycle-evidence.schema.json",
    ".pi/agent/state/schemas/product-slice-plan.schema.json",
    ".pi/agent/state/schemas/stitch-screen-artifact.schema.json",
    ".pi/agent/state/schemas/live-stitch-artifact.schema.json",
    ".pi/agent/state/schemas/screen-artifact-approval.schema.json",
    ".pi/agent/state/schemas/slice-contract.schema.json",
    ".pi/agent/state/schemas/frontend-validation-evidence.schema.json",
    ".pi/agent/state/schemas/slice-dependency-decision.schema.json",
    ".pi/agent/state/schemas/parallel-worker-lanes.schema.json",
    ".pi/agent/package/templates/runtime/leases.json",
    "docs/initiatives/TEMPLATE/slice-plan.json",
    "package.json",
    "packages/pi-g-skills/package.json",
]:
    with (root / rel).open("r", encoding="utf-8") as f:
        json.load(f)
workflow_doc = (root / ".pi/agent/docs/architecture_review_workflow.md").read_text(encoding="utf-8")
validation_doc = (root / ".pi/agent/docs/validation_architecture.md").read_text(encoding="utf-8")
file_map_doc = (root / ".pi/agent/docs/file_map.md").read_text(encoding="utf-8")
readme_doc = (root / "README.md").read_text(encoding="utf-8")
task_packet_schema_doc = (root / ".pi/agent/state/schemas/task-packet.schema.json").read_text(encoding="utf-8")
handoff_schema_doc = (root / ".pi/agent/state/schemas/handoff.schema.json").read_text(encoding="utf-8")
queue_schema_doc = (root / ".pi/agent/state/schemas/queue.schema.json").read_text(encoding="utf-8")
queue_semantics_doc = (root / ".pi/agent/docs/queue_semantics.md").read_text(encoding="utf-8")
validation_recovery_doc = (root / ".pi/agent/docs/validation_recovery_architecture.md").read_text(encoding="utf-8")
prompt_semantics_doc = (root / ".pi/agent/docs/validation_architecture.md").read_text(encoding="utf-8")
operator_workflow_doc = (root / ".pi/agent/docs/operator_workflow.md").read_text(encoding="utf-8")
phase_model_routing_doc = (root / ".pi/agent/docs/phase_model_routing.md").read_text(encoding="utf-8")
operator_model_routing_doc = (root / ".pi/agent/docs/operator_model_routing_guide.md").read_text(encoding="utf-8")
discovery_policy_doc = (root / ".pi/agent/docs/discovery_policy.md").read_text(encoding="utf-8")
orchestrator_prompt = (root / ".pi/agent/prompts/roles/orchestrator.md").read_text(encoding="utf-8")
operator_role_doc = (root / ".pi/agent/docs/operator_role_guide.md").read_text(encoding="utf-8")
graphify_discovery_doc = (root / ".pi/agent/docs/graphify_discovery_research.md").read_text(encoding="utf-8")
graphify_adapter_doc = (root / ".pi/agent/docs/graphify_adapter.md").read_text(encoding="utf-8")
graphify_final_runbook_doc = (root / ".pi/agent/docs/graphify_final_runbook.md").read_text(encoding="utf-8")
architecture_roadmap_alignment_doc = (root / ".pi/agent/docs/architecture_roadmap_alignment.md").read_text(encoding="utf-8")
harness_package_install_doc = (root / ".pi/agent/docs/harness_package_install.md").read_text(encoding="utf-8")
operator_install_guide_doc = (root / ".pi/agent/docs/operator_install_guide.md").read_text(encoding="utf-8")
product_planning_doc = (root / ".pi/agent/docs/product_planning_workflow.md").read_text(encoding="utf-8")
product_slice_lifecycle_doc = (root / ".pi/agent/docs/product_slice_lifecycle.md").read_text(encoding="utf-8")
stitch_prompt_generation_doc = (root / ".pi/agent/docs/stitch_prompt_generation.md").read_text(encoding="utf-8")
stitch_artifacts_doc = (root / ".pi/agent/docs/stitch_artifacts.md").read_text(encoding="utf-8")
live_stitch_adapter_doc = (root / ".pi/agent/docs/live_stitch_adapter.md").read_text(encoding="utf-8")
slice_lifecycle_doc = (root / ".pi/agent/docs/slice_lifecycle.md").read_text(encoding="utf-8")
lifecycle_evidence_schema = json.loads((root / ".pi/agent/state/schemas/lifecycle-evidence.schema.json").read_text(encoding="utf-8"))
product_slice_lifecycle_schema = json.loads((root / ".pi/agent/state/schemas/product-slice-plan.schema.json").read_text(encoding="utf-8"))
stitch_screen_artifact_schema = json.loads((root / ".pi/agent/state/schemas/stitch-screen-artifact.schema.json").read_text(encoding="utf-8"))
live_stitch_artifact_schema = json.loads((root / ".pi/agent/state/schemas/live-stitch-artifact.schema.json").read_text(encoding="utf-8"))
screen_artifact_approval_schema = json.loads((root / ".pi/agent/state/schemas/screen-artifact-approval.schema.json").read_text(encoding="utf-8"))
slice_contract_schema = json.loads((root / ".pi/agent/state/schemas/slice-contract.schema.json").read_text(encoding="utf-8"))
frontend_validation_evidence_schema = json.loads((root / ".pi/agent/state/schemas/frontend-validation-evidence.schema.json").read_text(encoding="utf-8"))
product_slice_template = json.loads((root / "docs/initiatives/TEMPLATE/slice-plan.json").read_text(encoding="utf-8"))
deep_module_doc = (root / ".pi/agent/docs/deep_module_refactoring_workflow.md").read_text(encoding="utf-8")
tdd_behavior_doc = (root / ".pi/agent/docs/tdd_behavior_first_workflow.md").read_text(encoding="utf-8")
g_coding_skill = (root / "packages/pi-g-skills/skills/g-coding/SKILL.md").read_text(encoding="utf-8")
g_planning_skill = (root / "packages/pi-g-skills/skills/g-planning/SKILL.md").read_text(encoding="utf-8")
g_skills_readme = (root / "packages/pi-g-skills/README.md").read_text(encoding="utf-8")
g_skills_porting_matrix = (root / "packages/pi-g-skills/docs/porting-matrix.md").read_text(encoding="utf-8")
g_grill_skill = (root / "packages/pi-g-skills/skills/g-grill/SKILL.md").read_text(encoding="utf-8")
g_prd_skill = (root / "packages/pi-g-skills/skills/g-prd/SKILL.md").read_text(encoding="utf-8")
g_issues_skill = (root / "packages/pi-g-skills/skills/g-issues/SKILL.md").read_text(encoding="utf-8")
g_refactor_skill = (root / "packages/pi-g-skills/skills/g-refactor/SKILL.md").read_text(encoding="utf-8")
team_orchestration_doc = (root / ".pi/agent/docs/team_orchestration_architecture.md").read_text(encoding="utf-8")
planning_lead_prompt = (root / ".pi/agent/prompts/roles/planning_lead.md").read_text(encoding="utf-8")
build_lead_prompt = (root / ".pi/agent/prompts/roles/build_lead.md").read_text(encoding="utf-8")
frontend_worker_prompt = (root / ".pi/agent/prompts/roles/frontend_worker.md").read_text(encoding="utf-8")
backend_worker_prompt = (root / ".pi/agent/prompts/roles/backend_worker.md").read_text(encoding="utf-8")
infra_worker_prompt = (root / ".pi/agent/prompts/roles/infra_worker.md").read_text(encoding="utf-8")
research_worker_prompt = (root / ".pi/agent/prompts/roles/research_worker.md").read_text(encoding="utf-8")
validation_checklist_skill = (root / ".pi/agent/skills/validation-checklist/SKILL.md").read_text(encoding="utf-8")
packet_policy_doc = (root / ".pi/agent/packets/packet-policy.json").read_text(encoding="utf-8")
gitignore_doc = (root / ".gitignore").read_text(encoding="utf-8")
package_manifest = json.loads((root / ".pi/agent/package/harness-package.json").read_text(encoding="utf-8"))
package_template_json = json.loads((root / ".pi/agent/package/templates/package.template.json").read_text(encoding="utf-8"))
core_workflows_validator = (root / "scripts/validate-core-workflows.sh").read_text(encoding="utf-8")
graphify_validator = (root / "scripts/validate-graphify-discovery.sh").read_text(encoding="utf-8")
reviewer_prompt = (root / ".pi/agent/prompts/roles/reviewer_worker.md").read_text(encoding="utf-8")
validator_prompt = (root / ".pi/agent/prompts/roles/validator_worker.md").read_text(encoding="utf-8")
review_template = (root / ".pi/agent/prompts/templates/review-diff.md").read_text(encoding="utf-8")
validate_template = (root / ".pi/agent/prompts/templates/validate-task.md").read_text(encoding="utf-8")
discovery_policy_extension = (root / ".pi/agent/extensions/discovery-policy.ts").read_text(encoding="utf-8")
graphify_validation_decision_extension = (root / ".pi/agent/extensions/graphify-validation-decision.ts").read_text(encoding="utf-8")
graphify_orchestration_decision_extension = (root / ".pi/agent/extensions/graphify-orchestration-decision.ts").read_text(encoding="utf-8")
graphify_orchestrator_extension = (root / ".pi/agent/extensions/graphify-orchestrator.ts").read_text(encoding="utf-8")
execution_leases_extension = (root / ".pi/agent/extensions/execution-leases.ts").read_text(encoding="utf-8")
slice_lifecycle_extension = (root / ".pi/agent/extensions/slice-lifecycle.ts").read_text(encoding="utf-8")
product_slice_lifecycle_extension = (root / ".pi/agent/extensions/product-slice-lifecycle.ts").read_text(encoding="utf-8")
stitch_extension = (root / ".pi/agent/extensions/stitch.ts").read_text(encoding="utf-8")
stitch_prompt_generator_extension = (root / ".pi/agent/extensions/stitch-prompt-generator.ts").read_text(encoding="utf-8")
stitch_artifact_adapter_extension = (root / ".pi/agent/extensions/stitch-artifact-adapter.ts").read_text(encoding="utf-8")
live_stitch_adapter_extension = (root / ".pi/agent/extensions/live-stitch-adapter.ts").read_text(encoding="utf-8")
screen_artifact_approval_extension = (root / ".pi/agent/extensions/screen-artifact-approval.ts").read_text(encoding="utf-8")
slice_contract_extension = (root / ".pi/agent/extensions/slice-contracts.ts").read_text(encoding="utf-8")
packets_extension = (root / ".pi/agent/extensions/packets.ts").read_text(encoding="utf-8")
frontend_packet_extension = (root / ".pi/agent/extensions/frontend-packet-generator.ts").read_text(encoding="utf-8")
backend_packet_extension = (root / ".pi/agent/extensions/backend-packet-generator.ts").read_text(encoding="utf-8")
slice_dependency_decision_extension = (root / ".pi/agent/extensions/slice-dependency-decision.ts").read_text(encoding="utf-8")
slice_dependency_decision_schema = json.loads((root / ".pi/agent/state/schemas/slice-dependency-decision.schema.json").read_text(encoding="utf-8"))
slice_dependency_decision_doc = (root / ".pi/agent/docs/slice_dependency_decision.md").read_text(encoding="utf-8")
product_pipeline_extension = (root / ".pi/agent/extensions/product-pipeline.ts").read_text(encoding="utf-8")
parallel_worker_lanes_extension = (root / ".pi/agent/extensions/parallel-worker-lanes.ts").read_text(encoding="utf-8")
parallel_worker_lanes_schema = json.loads((root / ".pi/agent/state/schemas/parallel-worker-lanes.schema.json").read_text(encoding="utf-8"))
parallel_worker_lanes_doc = (root / ".pi/agent/docs/parallel_worker_lanes.md").read_text(encoding="utf-8")
parallel_worker_lanes_validator = (root / "scripts/validate-parallel-worker-lanes.sh").read_text(encoding="utf-8")
product_pipeline_schema = json.loads((root / ".pi/agent/state/schemas/product-pipeline.schema.json").read_text(encoding="utf-8"))
product_slice_lifecycle_validator = (root / "scripts/validate-product-slice-lifecycle.sh").read_text(encoding="utf-8")
slice_lifecycle_validator = (root / "scripts/validate-slice-lifecycle.sh").read_text(encoding="utf-8")
harness_slice_lifecycle_cli = (root / "scripts/harness-slice-lifecycle.ts").read_text(encoding="utf-8")
harness_merge_cli = (root / "scripts/harness-merge.ts").read_text(encoding="utf-8")
stitch_prompt_validator = (root / "scripts/validate-stitch-prompts.sh").read_text(encoding="utf-8")
stitch_artifact_validator = (root / "scripts/validate-stitch-artifacts.sh").read_text(encoding="utf-8")
live_stitch_artifact_validator = (root / "scripts/validate-live-stitch-artifacts.sh").read_text(encoding="utf-8")
screen_artifact_approval_validator = (root / "scripts/validate-screen-artifact-approval.sh").read_text(encoding="utf-8")
slice_contract_validator = (root / "scripts/validate-slice-contracts.sh").read_text(encoding="utf-8")
frontend_packet_validator = (root / "scripts/validate-frontend-packets.sh").read_text(encoding="utf-8")
backend_packet_validator = (root / "scripts/validate-backend-packets.sh").read_text(encoding="utf-8")
slice_dependency_validator = (root / "scripts/validate-slice-dependencies.sh").read_text(encoding="utf-8")
product_pipeline_validator = (root / "scripts/validate-product-pipeline.sh").read_text(encoding="utf-8")
product_pipeline_e2e_validator = (root / "scripts/validate-product-pipeline-e2e.sh").read_text(encoding="utf-8")
product_pipeline_e2e_test = (root / "tests/integration/product-pipeline-e2e.test.ts").read_text(encoding="utf-8")
product_pipeline_e2e_doc = (root / ".pi/agent/docs/product_pipeline_e2e_pilot.md").read_text(encoding="utf-8")
slice_contract_doc = (root / ".pi/agent/docs/slice_contracts.md").read_text(encoding="utf-8")
frontend_packet_doc = (root / ".pi/agent/docs/frontend_packet_generation.md").read_text(encoding="utf-8")
backend_packet_doc = (root / ".pi/agent/docs/backend_packet_generation.md").read_text(encoding="utf-8")
product_pipeline_doc = (root / ".pi/agent/docs/product_pipeline_runtime.md").read_text(encoding="utf-8")
till_done_extension = (root / ".pi/agent/extensions/till-done.ts").read_text(encoding="utf-8")
recovery_extension = (root / ".pi/agent/extensions/recovery.ts").read_text(encoding="utf-8")
orchestrator_extension = (root / ".pi/agent/extensions/orchestrator.ts").read_text(encoding="utf-8")
task_packets_extension = (root / ".pi/agent/extensions/task-packets.ts").read_text(encoding="utf-8")
handoffs_extension = (root / ".pi/agent/extensions/handoffs.ts").read_text(encoding="utf-8")
queue_runner = (root / ".pi/agent/extensions/queue-runner.ts").read_text(encoding="utf-8")
queue_runner_validator = (root / "scripts/validate-queue-runner.sh").read_text(encoding="utf-8")
extension_unit_validator = (root / "scripts/validate-extension-unit-tests.sh").read_text(encoding="utf-8")
pr_gate_helper = (root / "scripts/harness-pr-gate.ts").read_text(encoding="utf-8")
package_json = json.loads((root / "package.json").read_text(encoding="utf-8"))
models_json = json.loads((root / ".pi/agent/models.json").read_text(encoding="utf-8"))
for needle in ["recoveryPolicyExtension", "recoveryRuntimeExtension", "resolveRecoveryRuntimeDecision"]:
    assert needle in recovery_extension, needle
for needle in ["taskPacketsExtension", "generateFrontendImplementationPacket", "generateBackendImplementationPacket"]:
    assert needle in packets_extension, needle
for needle in ["generateStitchPrompt", "generateMockStitchArtifact", "planLiveStitchArtifact"]:
    assert needle in stitch_extension, needle
for needle in [
    "slugFromGoal",
    "classifyOrchestratorGoal",
    "analyzeOrchestratorContext",
    "collectOrchestratorContextSignals",
    "assertSafeDelegatedDryRunCommand",
    "planOrchestratorDryRun",
    "rejectUnsafeApplyVerb",
    "buildOrchestratorApplyPlan",
    "assertCreatedFilesWithinAllowlist",
    "runOrchestratorApply",
    "assertSafeDelegatedRunCommand",
    "defaultOrchestratorRunPreflight",
    "runOrchestratorRun",
    "runOrchestratorContinue",
    "collectOrchestratorEvidence",
    "assertNoRawGitMergeCommand",
    "runOrchestratorMergeCheck",
    "runOrchestratorMergeApply",
    "orchestratorClassifierExtension",
    "orchestratorContextExtension",
    "orchestratorDryRunExtension",
    "orchestratorApplyPolicyExtension",
    "orchestratorRunExtension",
    "orchestratorContinueExtension",
    "orchestratorEvidenceExtension",
]:
    assert needle in orchestrator_extension, needle
for rel, needle in [
    ("scripts/harness-fe-packet.ts", "../.pi/agent/extensions/packets.ts"),
    ("scripts/harness-be-packet.ts", "../.pi/agent/extensions/packets.ts"),
    ("scripts/harness-stitch-prompt.ts", "../.pi/agent/extensions/stitch.ts"),
    ("scripts/harness-stitch-artifact.ts", "../.pi/agent/extensions/stitch.ts"),
    ("scripts/harness-live-stitch-artifact.ts", "../.pi/agent/extensions/stitch.ts"),
    ("scripts/harness-orchestrate.ts", "../.pi/agent/extensions/orchestrator.ts"),
]:
    assert needle in (root / rel).read_text(encoding="utf-8"), rel
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
assert "graphify-validation-decision.ts" in extension_unit_validator
assert "graphify-validation-decision.test.ts" in extension_unit_validator
assert "graphify-orchestration-decision.ts" in extension_unit_validator
assert "graphify-orchestration-decision.test.ts" in extension_unit_validator
assert "graphify-orchestrator.ts" in extension_unit_validator
assert "graphify-orchestrator.test.ts" in extension_unit_validator
assert "execution-leases.ts" in extension_unit_validator
assert "execution-leases.test.ts" in extension_unit_validator
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

for needle in [
    "run_graphify_orchestration",
    "graphify_adapter",
    "decideGraphifyOrchestration",
    "adapterParamsForDecision",
    "commandStatus",
    "run_preflight",
    "run_scan",
    "check_freshness",
    "query_graph",
    "--watch",
]:
    assert needle in graphify_orchestrator_extension
for needle in [
    "LEASES_FILE",
    "defaultExecutionLeaseState",
    "normalizeExecutionLeaseState",
    "pruneExpiredExecutionLeases",
    "acquireExecutionLease",
    "releaseExecutionLease",
    "summarizeExecutionLeases",
    "heartbeatAt",
]:
    assert needle in execution_leases_extension
for needle in [
    "run_graphify_orchestration",
    ".pi/agent/extensions/graphify-orchestrator.ts",
]:
    assert needle in graphify_adapter_doc
    assert needle in readme_doc


for needle in [
    "graphifyOrchestration",
    "maybeRunResearchGraphifyForNextQueuedJob",
    "isResearchQueueJob",
    "run_graphify_orchestration",
    "Research Graphify orchestration blocked queued job",
]:
    assert needle in queue_runner
for needle in [
    "graphifyOrchestration",
    "curated_research",
    "before_final_validation",
]:
    assert needle in queue_schema_doc
for needle in [
    "Explicit research Graphify orchestration",
    "graphifyOrchestration.enabled: true",
    "run_graphify_orchestration",
    "at most once per bounded session",
]:
    assert needle in queue_semantics_doc
    assert needle in operator_workflow_doc or needle == "Explicit research Graphify orchestration"
assert "graphifyOrchestration.enabled: true" in readme_doc
assert "graphify-orchestrator.ts" in queue_runner_validator
assert "graphify-orchestration-decision.ts" in queue_runner_validator
assert "research Graphify orchestration" in queue_runner_validator
assert "graphify-orchestrator.ts" in core_workflows_validator

for needle in [
    "GraphifyEvidence",
    "graphifyEvidence",
    "renderGraphifyEvidence",
    "graphify validation state",
]:
    assert needle in task_packets_extension
for needle in [
    "graphifyEvidence",
    "renderGraphifyEvidence",
    "preservedPacket",
    "details",
]:
    assert needle in handoffs_extension
for needle in [
    "graphifyEvidence",
    "latestRelevantGraphQueried",
    "importantClaimsSourceVerified",
    "Graphify-backed or architecture-review claims",
]:
    assert needle in task_packet_schema_doc
    assert needle in handoff_schema_doc
for needle in [
    "optional `graphifyEvidence`",
    "Graphify Evidence",
    "source-verification proof",
]:
    assert needle in team_orchestration_doc
for needle in [
    "GraphifyEvidenceInput",
    "graphifyValidationFromEvidence",
    "graphifyOrchestrationAction",
    "graphifyAdapterAction",
    "latestRelevantGraphQueried",
    "importantClaimsSourceVerified",
]:
    assert needle in till_done_extension
for needle in [
    "validator checks in `task_update` can consume structured `graphifyEvidence` orchestration evidence",
    "graph query/freshness and source-verification proof",
]:
    assert needle in readme_doc
assert "structured `graphifyEvidence` orchestration evidence as latest relevant graph query or freshness/cadence proof" in validation_doc

graphify_lifecycle_title = "Graphify evidence lifecycle drift guard"
graphify_lifecycle_contract = "explicit research queue-session orchestration -> graphifyEvidence in packet/handoff -> task_update validator consumption"
graphify_lifecycle_safety_needles = [
    "metadata is optional",
    "no global mandatory Graphify",
    "no Graphify CLI --watch, daemon, or background behavior",
    "source verification remains required",
]
for doc_name, doc_text in [
    ("README.md", readme_doc),
    ("operator_workflow.md", operator_workflow_doc),
    ("queue_semantics.md", queue_semantics_doc),
    ("team_orchestration_architecture.md", team_orchestration_doc),
    ("validation_architecture.md", validation_doc),
    ("graphify_adapter.md", graphify_adapter_doc),
    ("graphify_final_runbook.md", graphify_final_runbook_doc),
]:
    assert graphify_lifecycle_title in doc_text, f"{doc_name} missing Graphify lifecycle drift guard title"
    assert graphify_lifecycle_contract in doc_text, f"{doc_name} missing Graphify lifecycle contract"
    for needle in graphify_lifecycle_safety_needles:
        assert needle in doc_text, f"{doc_name} missing Graphify lifecycle safety language: {needle}"

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
    "global skill ports `g-grill`, `g-prd`, and `g-issues`",
    "harness:init-feature",
    "harness:product-intake",
    "PRD/backlog happen before Stitch",
    "Phase 1 product intake never calls Stitch, never creates task packets, and never dispatches queue jobs.",
    "Do not generate FE/BE worker packets from `harness:product-intake`",
    "/skill:g-grill",
    "/skill:g-prd",
    "/skill:g-issues",
]:
    assert needle in product_planning_doc
for needle in [
    "Product planning flows from grill-style clarification to PRD to vertical-slice backlog.",
    "Vertical slices must be independently demonstrable or verifiable.",
]:
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
    "global `g-refactor` skill",
]:
    assert needle in deep_module_doc
for needle in [
    "g-grill",
    "g-prd",
    "g-issues",
    "g-refactor",
]:
    assert needle in g_skills_readme
    assert needle in g_skills_porting_matrix
for skill_text in [g_grill_skill, g_prd_skill, g_issues_skill, g_refactor_skill]:
    for needle in [
        "## Pi",
        "## Output contract",
    ]:
        assert needle in skill_text
for needle in [
    "## Workflow",
    "one focused question at a time",
]:
    assert needle in g_grill_skill
for needle in [
    "problem statement",
    "user stories",
    "implementation decisions",
    "testing decisions",
]:
    assert needle in g_prd_skill
for needle in [
    "vertical slices",
    "HITL",
    "AFK",
    "dependencies",
]:
    assert needle in g_issues_skill
for needle in [
    "deletion test",
    "dependency categories",
    "interface is the test surface",
]:
    assert needle.lower() in g_refactor_skill.lower()
for needle in [
    "For non-trivial implementation work, make the TDD slice contract explicit:",
    "first tracer-bullet behavior",
    "public interface that proves it",
    "boundary dependencies and mock/fake plan",
    "behaviors intentionally left out of scope",
]:
    assert needle in g_planning_skill
for needle in [
    "for implementation planning, make the TDD slice contract explicit: first tracer-bullet behavior, public interface that proves it, boundary dependencies/mock plan, and behaviors intentionally left out of scope",
    ".pi/agent/docs/tdd_behavior_first_workflow.md",
    ".pi/agent/docs/deep_module_refactoring_workflow.md",
]:
    assert needle in planning_lead_prompt
for needle in [
    "preserve the TDD slice contract from planning: first tracer-bullet behavior, public interface that proves it, boundary dependencies/mock plan, and behaviors intentionally left out of scope",
    "when tests are relevant, preserve RED/GREEN proof expectations, the named behavior under test, the public interface used, any non-boundary mock justification, and the post-GREEN refactor check in the packet",
]:
    assert needle in build_lead_prompt
worker_tdd_needles = [
    "Use behavior-first TDD: one failing behavior test, one minimal implementation, then repeat.",
    "Do not batch speculative tests ahead of implementation.",
    "Prefer tests through public interfaces and observable behavior.",
    "Mock only system boundaries by default; justify stronger mocking explicitly when needed.",
    "Refactor only while GREEN, then rerun the relevant tests after each refactor step.",
]
for prompt in [frontend_worker_prompt, backend_worker_prompt, infra_worker_prompt]:
    for needle in worker_tdd_needles:
        assert needle in prompt
for needle in [
    "Challenge tests that target private helpers, internal call order, or owned collaborators without a justified boundary reason.",
    "When tests are relevant, require RED/GREEN evidence or an explicit explanation of why RED was not practical.",
    ".pi/agent/docs/deep_module_refactoring_workflow.md",
]:
    assert needle in reviewer_prompt
for needle in [
    "Treat tests that depend on private helpers, internal call order, or unjustified owned-collaborator mocks as weak proof.",
    "When tests are relevant, require RED/GREEN evidence or an explicit explanation of why RED was not practical.",
    ".pi/agent/docs/deep_module_refactoring_workflow.md",
]:
    assert needle in validator_prompt
for needle in [
    "When tests are relevant, confirm evidence includes RED/GREEN commands or an explicit reason RED was not practical.",
    "Challenge tests that depend on private helpers, internal call order, or unjustified owned-collaborator mocks.",
    "Confirm the named behavior under test and the public interface are explicit when behavior-first TDD is claimed.",
]:
    assert needle in validation_checklist_skill
for needle in [
    "## Lightweight test-quality review checklist",
    "Behavior is visible through a public interface.",
    "Private-helper-only tests are justified explicitly when unavoidable.",
    "Owned-collaborator mocks are justified explicitly when unavoidable.",
    "Boundary mocks are named explicitly.",
    "Refactor steps keep tests GREEN.",
]:
    assert needle in tdd_behavior_doc
for needle in [
    "Confirm the tested behavior is visible through a public interface, not only a private helper.",
    "Require private-helper-only tests to carry an explicit justification when they are truly necessary.",
    "Require owned-collaborator mocks to carry an explicit justification when they are truly necessary.",
    "Require boundary mocks to be named explicitly in the evidence or review notes.",
    "When refactor work is claimed, confirm the relevant tests stayed GREEN through the refactor step.",
]:
    assert needle in validation_checklist_skill
for needle in [
    "Use the lightweight test-quality review checklist from `.pi/agent/docs/tdd_behavior_first_workflow.md`.",
    "Require behavior to stay visible through a public interface, not only a private helper.",
    "Require boundary mocks to be named explicitly, and require owned-collaborator or private-helper-only tests to be justified.",
    "When refactor work is claimed, require evidence that the relevant tests stayed GREEN through the refactor step.",
]:
    assert needle in reviewer_prompt
for needle in [
    "Use the lightweight test-quality review checklist from `.pi/agent/docs/tdd_behavior_first_workflow.md`.",
    "Require behavior to stay visible through a public interface, not only a private helper.",
    "Require boundary mocks to be named explicitly, and require owned-collaborator or private-helper-only tests to be justified.",
    "When refactor work is claimed, require evidence that the relevant tests stayed GREEN through the refactor step.",
]:
    assert needle in validator_prompt
for needle in [
    "Record RED and GREEN commands when tests are relevant, or state explicitly why RED was not practical.",
    "Name the single behavior under test and the public interface proving it.",
    "Justify any non-boundary mock and note the post-GREEN refactor check.",
    "For implementation planning, make the TDD slice contract explicit: first tracer-bullet behavior, public interface, boundary dependencies/mock plan, and intentionally excluded behaviors.",
    "Preserve the TDD slice contract from planning: first tracer-bullet behavior, public interface, boundary dependencies/mock plan, and intentionally excluded behaviors.",
    "Reject weak proof when tests depend on private helpers, internal call order, or unjustified owned-collaborator mocks.",
]:
    assert needle in packet_policy_doc
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
    "logs/harness-actions.jsonl*",
]:
    assert needle in gitignore_doc
assert ".pi/agent/artifacts" in package_manifest.get("excludedPaths", [])
assert ".pi/agent/state/runtime" in package_manifest.get("excludedPaths", [])
assert any(entry.get("target") == ".pi/agent/state/runtime/leases.json" and entry.get("template") == ".pi/agent/package/templates/runtime/leases.json" for entry in package_manifest.get("generatedFiles", []))
assert "harness:pr-gate" in package_json.get("scripts", {})
assert "test:pr-gate" in package_json.get("scripts", {})
assert "harness:sync-main" in package_json.get("scripts", {})
assert "test:sync-main" in package_json.get("scripts", {})
assert "harness:init-feature" in package_json.get("scripts", {})
assert "harness:init-feature" in package_template_json.get("scripts", {})
assert "harness:product-intake" in package_json.get("scripts", {})
assert "harness:product-intake" in package_template_json.get("scripts", {})
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
    "harness:init-feature",
    "harness:product-intake",
    "docs/initiatives/<feature-slug>/",
    "/skill:g-grill",
    "/skill:g-prd",
    "/skill:g-issues",
]:
    assert needle in readme_doc
    assert needle in harness_package_install_doc
    assert needle in operator_install_guide_doc
for needle in [
    "scripts/harness-pr-gate.ts",
    "scripts/harness-sync-main.ts",
    "scripts/harness-init-feature.ts",
    "scripts/harness-product-intake.ts",
]:
    assert needle in file_map_doc
    assert needle in validation_doc
for needle in [
    "intake.json",
    "stitch_generation",
    "task_packet_generation",
    "queue_dispatch",
    "ready_for_prd",
    "blocked",
]:
    assert needle in (root / "scripts/harness-product-intake.ts").read_text(encoding="utf-8")
    assert needle in (root / "tests/integration/harness-product-intake.test.ts").read_text(encoding="utf-8")
for needle in [
    "PRD/backlog happen before Stitch",
    "Phase 1 product intake does not call Stitch",
    "Phase 1 product intake does not create task packets, queue jobs, frontend packets, or backend packets",
]:
    assert needle in (root / ".pi/agent/docs/intake_policy.md").read_text(encoding="utf-8")
required_product_phases = [
    "stitch_prompt",
    "stitch_generation",
    "screen_approval",
    "slice_contract",
    "fe_implementation",
    "fe_validation",
    "be_implementation",
    "be_validation",
    "quality",
]
assert [entry["const"] for entry in product_slice_lifecycle_schema["$defs"]["requiredPhaseOrder"]["prefixItems"]] == required_product_phases
assert product_slice_template["policy"]["requiredPhaseOrder"] == required_product_phases
assert product_slice_template["policy"]["intraSliceParallelism"] == "forbidden"
assert "test:product-slice-lifecycle" in package_json.get("scripts", {})
assert "validate:product-slice-lifecycle" in package_json.get("scripts", {})
assert "harness:stitch-prompt" in package_json.get("scripts", {})
assert "harness:stitch-prompt" in package_template_json.get("scripts", {})
assert "test:stitch-prompt" in package_json.get("scripts", {})
assert "validate:stitch-prompt" in package_json.get("scripts", {})
assert "harness:stitch-artifact" in package_json.get("scripts", {})
assert "harness:stitch-artifact" in package_template_json.get("scripts", {})
assert "test:stitch-artifact" in package_json.get("scripts", {})
assert "validate:stitch-artifact" in package_json.get("scripts", {})
assert "harness:screen-approval" in package_json.get("scripts", {})
assert "harness:screen-approval" in package_template_json.get("scripts", {})
assert "test:screen-approval" in package_json.get("scripts", {})
assert "validate:screen-approval" in package_json.get("scripts", {})
for needle in [
    "PRODUCT_SLICE_PHASE_ORDER",
    "decideProductSlicePhaseTransition",
    "validateProductSlicePlan",
    "loadProductSlicePlan",
    "blocked_same_slice_parallel",
    "blocked_out_of_order",
]:
    assert needle in product_slice_lifecycle_extension
for needle in [
    "product-slice-lifecycle.ts",
    "product-slice-lifecycle.test.ts",
    "product-slice-plan.schema.json",
]:
    assert needle in extension_unit_validator
for needle in [
    "planning/DAG only",
    "does not write queue state",
    "does not create tasks",
    "does not call Stitch",
    "does not dispatch",
    "fe_validation",
    "be_implementation",
]:
    assert needle in product_slice_lifecycle_doc
for needle in [
    "docs/initiatives/<feature-slug>/slice-plan.json",
    "Product slice lifecycle is Phase 2 planning/DAG only",
    "Same-slice parallel phase requests are forbidden",
    "be_implementation` is blocked until `fe_validation` is complete",
]:
    assert needle in product_planning_doc
assert "intentionally separate from the product-slice planning/DAG lifecycle" in slice_lifecycle_doc
assert lifecycle_evidence_schema["title"] == "Lifecycle Evidence Bundle"
assert lifecycle_evidence_schema["properties"]["version"]["const"] == 1
assert "directImplementationExemption" in lifecycle_evidence_schema["properties"]
for needle in [
    "SliceLifecycleEvidenceBundle",
    "evidenceFile",
    "directImplementationExemption",
    "lifecycleEvidencePath",
]:
    assert needle in slice_lifecycle_extension, needle
for needle in [
    "--evidence-file",
    "reports/lifecycle/<task-id>.merge-evidence.json",
]:
    assert needle in slice_lifecycle_doc, needle
assert "--evidence-file" in harness_slice_lifecycle_cli
assert "--lifecycle-evidence" in harness_merge_cli
assert "--lifecycle-evidence" in operator_workflow_doc
for needle in [
    "slice-lifecycle-validator: unit tests",
    "slice-lifecycle-validator: integration tests",
    "slice-lifecycle-validator: compile helper and CLI",
]:
    assert needle in slice_lifecycle_validator
for needle in [
    "product-slice-lifecycle-validator: unit tests",
    "product-slice-lifecycle-validator: compile helper",
    "product-slice-lifecycle-validator: schema/docs wiring",
]:
    assert needle in product_slice_lifecycle_validator
for needle in [
    "generateStitchPrompt",
    "writeStitchPromptArtifacts",
    "REQUIRED_STITCH_PROMPT_SECTIONS",
    "sourceHashes",
    "promptHash",
    "human_prompt_review",
]:
    assert needle in stitch_prompt_generator_extension
for needle in [
    "does not call Stitch",
    "does not create task packets",
    "does not create queue jobs",
    "does not implement frontend or backend code",
    "human_prompt_review",
    "prompt hash",
]:
    assert needle in stitch_prompt_generation_doc
for needle in [
    "Phase 3 Stitch prompt generation",
    "prompt-only",
    "harness:stitch-prompt",
    "does not create queue jobs",
]:
    assert needle in product_planning_doc
assert "stitch_prompt_generation.md" in product_slice_lifecycle_doc
for needle in [
    "stitch-prompt-validator: unit tests",
    "stitch-prompt-validator: integration tests",
    "stitch-prompt-validator: compile helper and CLI",
]:
    assert needle in stitch_prompt_validator
assert stitch_screen_artifact_schema["properties"]["mode"]["const"] == "mock"
assert stitch_screen_artifact_schema["properties"]["phase"]["const"] == "stitch_generation"
assert stitch_screen_artifact_schema["properties"]["constraints"]["properties"]["liveStitchCalled"]["const"] is False
for needle in [
    "generateMockStitchArtifact",
    "writeMockStitchArtifactArtifacts",
    "sourceHashes",
    "promptHash",
    "human_artifact_review",
    "liveStitchCalled: false",
]:
    assert needle in stitch_artifact_adapter_extension, needle
for needle in [
    "mock-only",
    "does not call Stitch",
    "does not create task packets",
    "does not create queue jobs",
    "screen_approval",
    "human_artifact_review",
]:
    assert needle in stitch_artifacts_doc, needle
for needle in [
    "Phase 4 mock Stitch artifact generation",
    "harness:stitch-artifact",
    "does not create queue jobs",
    "human_artifact_review",
]:
    assert needle in product_planning_doc, needle
assert "stitch_artifacts.md" in product_slice_lifecycle_doc
assert "stitch_artifacts.md" in stitch_prompt_generation_doc
for needle in [
    "stitch-artifact-validator: unit tests",
    "stitch-artifact-validator: integration tests",
    "stitch-artifact-validator: compile helper and CLI",
]:
    assert needle in stitch_artifact_validator
assert screen_artifact_approval_schema["properties"]["decision"]["enum"] == ["pending", "approved", "rejected"]
assert screen_artifact_approval_schema["properties"]["requiredBefore"]["const"] == "fe_implementation"
assert "artifactHash" in screen_artifact_approval_schema["required"]
for needle in [
    "getScreenArtifactApprovalStatus",
    "approveScreenArtifact",
    "rejectScreenArtifact",
    "Stale screen artifact approval",
    "Re-approval after rejection requires explicit --reapprove",
]:
    assert needle in screen_artifact_approval_extension, needle
screen_artifact_approval_doc = (root / ".pi/agent/docs/screen_artifact_approval.md").read_text(encoding="utf-8")
for needle in [
    "approval-only",
    "does not create task packets",
    "does not create queue jobs",
    "does not write `.pi/agent/state/runtime/*.json`",
    "artifactHash` matches the current mock screen artifact hash",
]:
    assert needle in screen_artifact_approval_doc, needle
for needle in [
    "Phase 5 screen artifact approval",
    "harness:screen-approval",
    "does not write protected runtime JSON",
    "hash-bound screen artifact approval",
]:
    assert needle in product_planning_doc, needle
for needle in [
    "screen-artifact-approval-validator: unit tests",
    "screen-artifact-approval-validator: integration tests",
    "screen-artifact-approval-validator: compile helper and CLI",
]:
    assert needle in screen_artifact_approval_validator
assert "scripts/validate-screen-artifact-approval.sh" in validation_doc
assert "harness:screen-approval" in stitch_artifacts_doc

assert live_stitch_artifact_schema["properties"]["mode"]["const"] == "live"
assert live_stitch_artifact_schema["properties"]["phase"]["const"] == "stitch_generation"
assert live_stitch_artifact_schema["properties"]["constraints"]["properties"]["requiresHumanApproval"]["const"] is True
for needle in [
    "planLiveStitchArtifact",
    "applyLiveStitchArtifact",
    "writeLiveStitchArtifactArtifacts",
    "STITCH_API_KEY",
    "Forbidden live Stitch provider argument",
    "requiresHumanApproval: true",
    "queueJobsCreated: false",
]:
    assert needle in live_stitch_adapter_extension, needle
for needle in [
    "mock mode remains default",
    "live output still requires human approval",
    "does not create task packets",
    "does not create queue jobs",
    "does not dispatch workers",
    "does not run as a daemon",
]:
    assert needle in live_stitch_adapter_doc, needle
for needle in [
    "Phase 13 live Stitch generation",
    "harness:live-stitch-artifact",
    "generated live output still requires human approval",
]:
    assert needle in product_planning_doc, needle
for needle in [
    "live-stitch-artifact-validator: unit tests",
    "live-stitch-artifact-validator: integration tests",
    "live-stitch-artifact-validator: compile helper and CLI",
]:
    assert needle in live_stitch_artifact_validator
assert "harness:live-stitch-artifact" in package_json.get("scripts", {})
assert "harness:live-stitch-artifact" in package_template_json.get("scripts", {})
assert "test:live-stitch-artifact" in package_json.get("scripts", {})
assert "validate:live-stitch-artifact" in package_json.get("scripts", {})
assert "harness:live-stitch-artifact" in stitch_artifacts_doc
assert "live_stitch_adapter.md" in stitch_artifacts_doc
assert "mode: `mock` or `live`" in screen_artifact_approval_doc

assert slice_contract_schema["properties"]["status"]["enum"] == ["draft", "ready_for_review", "approved", "blocked"]
assert slice_contract_schema["properties"]["nextAllowedPhase"]["const"] == "fe_implementation"
for key in ["sourceScreenArtifact", "uiStateContract", "apiContract", "errors", "mockPlan", "tddSeeds", "outOfScope"]:
    assert key in slice_contract_schema["required"], key
for needle in [
    "generateSliceContract",
    "writeSliceContractArtifacts",
    "screen artifact approval",
    "Screen artifact approval is not approved",
    "Stale screen artifact approval",
    "Auth requirements are unset",
]:
    assert needle in slice_contract_extension, needle
for needle in [
    "writes no files",
    "writes only",
    "does not create task packets",
    "does not create queue jobs",
    "worker sessions",
    "current slice contract",
]:
    assert needle in slice_contract_doc, needle
for needle in [
    "Phase 6 slice contract generation",
    "harness:slice-contract",
    "does not create task packets",
    "does not create queue jobs",
    "does not write protected runtime JSON",
    "before FE implementation",
]:
    assert needle in product_planning_doc, needle
for needle in [
    "slice-contract-validator: unit tests",
    "slice-contract-validator: integration tests",
    "slice-contract-validator: compile helper and CLI",
]:
    assert needle in slice_contract_validator
assert "scripts/validate-slice-contracts.sh" in validation_doc
assert "harness:slice-contract" in package_json.get("scripts", {})
assert "contracts/<slice-id>.contract.json" in (root / ".pi/agent/docs/domain_governance.md").read_text(encoding="utf-8")
assert "Phase 6 slice contract path and hash" in team_orchestration_doc

for needle in [
    "generateFrontendImplementationPacket",
    "writeFrontendPacketPreview",
    "frontend_implementation",
    "Screen artifact approval is not approved",
    "allowedPaths must include",
    "tddSeeds must include",
]:
    assert needle in frontend_packet_extension, needle
for needle in [
    "preview-only",
    "no queue jobs",
    "no runtime tasks",
    "backend packets wait for a later phase",
    "frontend_implementation",
]:
    assert needle in frontend_packet_doc, needle
for needle in [
    "frontend-packet-validator: unit tests",
    "frontend-packet-validator: integration tests",
    "frontend-packet-validator: compile helper and cli",
]:
    assert needle in frontend_packet_validator, needle
for needle in [
    "Phase 8 frontend packet generation",
    "harness:fe-packet",
    "no runtime tasks",
    "no queue jobs",
    "no worker sessions",
    "backend packets wait for a later phase",
]:
    assert needle in product_planning_doc, needle
assert "scripts/validate-frontend-packets.sh" in validation_doc
assert "harness:fe-packet" in package_json.get("scripts", {})
assert "harness:fe-packet" in package_template_json.get("scripts", {})
assert "test:frontend-packet" in package_json.get("scripts", {})
assert "validate:frontend-packet" in package_json.get("scripts", {})
assert "frontend packet generation" in team_orchestration_doc.lower()
assert "frontend packet generation" in (root / ".pi/agent/docs/domain_governance.md").read_text(encoding="utf-8").lower()
assert "frontend packet generation" in frontend_worker_prompt.lower()
assert "Frontend packet generation" in readme_doc

assert frontend_validation_evidence_schema["properties"]["phase"]["const"] == "fe_validation"
assert "passed" in frontend_validation_evidence_schema["properties"]["status"]["enum"]
for key in ["frontendPacketPath", "contractHash", "validatedBehaviors", "commandsRun", "knownGaps", "completedAt"]:
    assert key in frontend_validation_evidence_schema["required"], key
for needle in [
    "generateBackendImplementationPacket",
    "writeBackendPacketPreview",
    "backend_implementation",
    "FE validation evidence status is not passed",
    "backend allowedPaths must include",
    "apiContract must include",
]:
    assert needle in backend_packet_extension, needle
for needle in [
    "follows frontend validation",
    "preview-only",
    "no queue jobs",
    "no runtime tasks",
    "no worker sessions",
    "backend_implementation",
]:
    assert needle in backend_packet_doc, needle
for needle in [
    "backend-packet-validator: unit tests",
    "backend-packet-validator: integration tests",
    "backend-packet-validator: compile helper and cli",
]:
    assert needle in backend_packet_validator, needle
for needle in [
    "Phase 9 backend packet generation",
    "harness:be-packet",
    "follows FE validation",
    "no runtime tasks",
    "no queue jobs",
    "no worker sessions",
    "no FE packet changes",
]:
    assert needle in product_planning_doc, needle
assert "frontend-validation-evidence.schema.json" in validation_doc
assert "scripts/validate-backend-packets.sh" in validation_doc
assert "harness:be-packet" in package_json.get("scripts", {})
assert "harness:be-packet" in package_template_json.get("scripts", {})
assert "test:backend-packet" in package_json.get("scripts", {})
assert "validate:backend-packet" in package_json.get("scripts", {})
assert "backend packet generation" in team_orchestration_doc.lower()
assert "backend packet generation" in (root / ".pi/agent/docs/domain_governance.md").read_text(encoding="utf-8").lower()
assert "backend packet generation" in backend_worker_prompt.lower()
assert "Backend packet generation" in readme_doc
assert slice_dependency_decision_schema["properties"]["version"]["const"] == 1
assert slice_dependency_decision_schema["properties"]["decision"]["enum"] == ["blocked", "allowed"]
assert slice_dependency_decision_schema["properties"]["recommendedExecution"]["enum"] == ["sequential", "parallel_candidate"]
for blocker in ["shared_file", "shared_contract", "shared_schema", "shared_config", "shared_test", "same_slice", "missing_proof", "lease_conflict_unknown"]:
    assert blocker in slice_dependency_decision_schema["$defs"]["blocker"]["properties"]["type"]["enum"], blocker
for proof_key in ["distinctSlices", "disjointFilesToModify", "disjointAllowedPaths", "disjointContracts", "noSharedSchemaOrMigration", "noSharedConfig", "noSharedTestsOrFixtures", "leaseConflictCheckAvailable"]:
    assert proof_key in slice_dependency_decision_schema["$defs"]["proof"]["required"], proof_key
for needle in [
    "decideSliceParallelism",
    "shared_file",
    "lease_conflict_unknown",
    "parallel_candidate",
]:
    assert needle in slice_dependency_decision_extension, needle
for forbidden in ["node:fs", "writeFile", "mkdir", "run_next_queue_job", "acquireLease", "task_update"]:
    assert forbidden not in slice_dependency_decision_extension, forbidden
for needle in [
    "Phase 10 does not dispatch work",
    "does not change queue-runner behavior",
    "does not schedule cross-slice parallel work",
    "Intra-slice phases remain sequential",
    "same-slice phase parallelism is still forbidden",
]:
    assert needle in slice_dependency_decision_doc, needle
for needle in [
    "slice-dependency-validator: unit tests",
    "slice-dependency-validator: integration tests",
    "slice-dependency-validator: compile helper and cli",
]:
    assert needle in slice_dependency_validator, needle
for needle in [
    "Phase 10 slice dependency decision",
    "harness:slice-dependencies",
    "no runtime tasks",
    "no queue jobs",
    "no worker sessions",
    "does not schedule cross-slice parallel work",
    "Intra-slice phases remain sequential",
]:
    assert needle in product_planning_doc, needle
assert "slice-dependency-decision.schema.json" in validation_doc
assert "scripts/validate-slice-dependencies.sh" in validation_doc
for script_name in ["harness:slice-dependencies", "test:slice-dependencies", "validate:slice-dependencies"]:
    assert script_name in package_json.get("scripts", {}), script_name
    assert script_name in package_template_json.get("scripts", {}), script_name
assert "slice dependency decision" in team_orchestration_doc.lower()
assert "slice dependency decision" in (root / ".pi/agent/docs/domain_governance.md").read_text(encoding="utf-8").lower()
assert "slice dependency" in readme_doc.lower()
for needle in [
    "buildProductPipelineRun",
    "computeNextReadySlices",
    "detectHitlGate",
    "Missing Phase 10 parallelAllowed proof",
    "assertApplyRepoPreflight",
]:
    assert needle in product_pipeline_extension, needle
for needle in [
    "no daemon",
    "Intra-slice phases remain sequential",
    "Cross-slice parallelism requires Phase 10",
    "dry-run writes no files",
    "apply performs one bounded",
    "HITL gates block apply",
]:
    assert needle in product_pipeline_doc, needle
for needle in [
    "product-pipeline-validator: unit tests",
    "product-pipeline-validator: integration tests",
    "product-pipeline-validator: compile helper and cli",
]:
    assert needle in product_pipeline_validator, needle
for needle in [
    "boundedFullAutoReadiness",
    "blockedPathsProven",
    "hitlGatesProven",
    "goNoGo",
    "liveProviderCalls",
    "liveStitchCalls",
    "trackedRuntimeJsonFiles",
    "waiting_for_human",
]:
    assert needle in product_pipeline_e2e_validator, needle
for needle in [
    "validate-product-pipeline-e2e.sh",
    "checkout-mini",
    "boundedFullAutoReadiness",
    "blockedPathsProven",
    "live boundaries",
]:
    assert needle in product_pipeline_e2e_test, needle
for needle in [
    "Phase 14",
    "checkout-mini",
    "No daemon/watch mode is introduced",
    "No live provider or live Stitch call is required by default",
    "boundedFullAutoReadiness",
]:
    assert needle in product_pipeline_e2e_doc, needle
assert "validate:product-pipeline-e2e" in package_json.get("scripts", {})
assert "product_pipeline_e2e" in core_workflows_validator or "product pipeline E2E pilot" in core_workflows_validator
assert product_pipeline_schema["title"] == "Product Pipeline Run"
for needle in [
    "planParallelWorkerLanes",
    "buildParallelWorkerLaneManifest",
    "parallelWorkerLaneManifestPath",
    "activeLeaseScopesFromRecords",
    "Missing Phase 10 parallelAllowed proof",
    "Same-slice phase parallelism is forbidden",
]:
    assert needle in parallel_worker_lanes_extension, needle
for needle in [
    "No daemon",
    "Same-slice phases are sequential",
    "Cross-slice parallelism requires Phase 10 `parallelAllowed: true` proof",
    "Operators must not edit `.pi/agent/state/runtime/*.json` directly",
    "Failed lane worktrees are preserved",
]:
    assert needle in parallel_worker_lanes_doc, needle
for needle in [
    "parallel-worker-lanes.test.ts",
    "check-repo-static.sh",
]:
    assert needle in parallel_worker_lanes_validator, needle
assert parallel_worker_lanes_schema["title"] == "Parallel Worker Lanes Manifest"
assert "harness:parallel-worker-lanes" in package_json.get("scripts", {})
assert "harness:parallel-worker-lanes" in package_template_json.get("scripts", {})
assert "test:parallel-worker-lanes" in package_json.get("scripts", {})
assert "validate:parallel-worker-lanes" in package_json.get("scripts", {})
assert "parallel-worker-lanes" in (root / "scripts/harness-operator.ts").read_text(encoding="utf-8")
assert "parallel worker lanes" in team_orchestration_doc.lower()
assert "parallel-worker-lanes" in product_pipeline_doc
assert "parallel-worker-lanes" in operator_workflow_doc
assert "harness:orchestrate" in package_json.get("scripts", {})
assert "harness:orchestrate" in package_template_json.get("scripts", {})
assert "validate:orchestrator-classifier" in package_json.get("scripts", {})
assert "validate:orchestrator-context" in package_json.get("scripts", {})
assert "validate:orchestrator-classifier" in package_template_json.get("scripts", {})
assert "validate:orchestrator-context" in package_template_json.get("scripts", {})
assert "validate:orchestrator-dry-run" in package_json.get("scripts", {})
assert "validate:orchestrator-dry-run" in package_template_json.get("scripts", {})
assert "validate:orchestrator-apply" in package_json.get("scripts", {})
assert "validate:orchestrator-apply" in package_template_json.get("scripts", {})
assert "validate:orchestrator-run" in package_json.get("scripts", {})
assert "validate:orchestrator-run" in package_template_json.get("scripts", {})
assert "validate:orchestrator-continue" in package_json.get("scripts", {})
assert "validate:orchestrator-continue" in package_template_json.get("scripts", {})
assert "validate:orchestrator-evidence" in package_json.get("scripts", {})
assert "validate:orchestrator-evidence" in package_template_json.get("scripts", {})
orchestrator_evidence_schema = json.loads((root / ".pi/agent/state/schemas/orchestrator-evidence.schema.json").read_text(encoding="utf-8"))
orchestrator_cli = (root / "scripts/harness-orchestrate.ts").read_text(encoding="utf-8")
orchestrator_context_helper = (root / ".pi/agent/extensions/orchestrator-context.ts").read_text(encoding="utf-8")
orchestrator_helper = (root / ".pi/agent/extensions/orchestrator-classifier.ts").read_text(encoding="utf-8")
orchestrator_dry_run_helper = (root / ".pi/agent/extensions/orchestrator-dry-run.ts").read_text(encoding="utf-8")
orchestrator_apply_helper = (root / ".pi/agent/extensions/orchestrator-apply-policy.ts").read_text(encoding="utf-8")
orchestrator_run_helper = (root / ".pi/agent/extensions/orchestrator-run.ts").read_text(encoding="utf-8")
orchestrator_continue_helper = (root / ".pi/agent/extensions/orchestrator-continue.ts").read_text(encoding="utf-8")
orchestrator_evidence_helper = (root / ".pi/agent/extensions/orchestrator-evidence.ts").read_text(encoding="utf-8")
orchestrator_doc = (root / ".pi/agent/docs/master_orchestrator.md").read_text(encoding="utf-8")
operator_cli = (root / "scripts/harness-operator.ts").read_text(encoding="utf-8")
assert "orchestrate" in operator_cli
assert "Delegate to Phase 5 master orchestrator classify/dry-run/apply/run/evidence/merge router" in operator_cli
assert "classify" in orchestrator_cli
assert "dry-run" in orchestrator_cli
assert "apply" in orchestrator_cli
assert "run" in orchestrator_cli
assert "continue" in orchestrator_cli
assert "evidence" in orchestrator_cli
assert "merge-check" in orchestrator_cli
assert "merge-apply" in orchestrator_cli
assert "planOrchestratorDryRun" in orchestrator_cli
assert "runOrchestratorApply" in orchestrator_cli
assert "runHarnessOrchestrateContext" in orchestrator_cli
assert "harness-orchestrate context" in orchestrator_cli
assert "analyzeOrchestratorContext" in orchestrator_context_helper
assert "greenfield_assumption" in orchestrator_context_helper
assert "active_existing_initiative" in orchestrator_context_helper
for forbidden in ["task_update", "run_next_queue_job", "generate_task_packet", "--allow-merge", "harness:merge -- apply", "gh pr merge", "git merge"]:
    assert forbidden not in orchestrator_context_helper
for forbidden in ["task_update", "run_next_queue_job", "generate_task_packet", "--allow-merge", "harness:merge -- apply"]:
    assert forbidden not in orchestrator_helper
for forbidden in ["task_update", "run_next_queue_job", "generate_task_packet", "gh pr merge", "git merge"]:
    assert forbidden not in orchestrator_dry_run_helper
assert "apply --queue-only" in orchestrator_continue_helper
assert "worker_job" in orchestrator_continue_helper
assert "max_slices" in orchestrator_continue_helper
for forbidden in ["task_update", "run_next_queue_job", "generate_task_packet", "gh pr merge", "git merge", "harness:merge -- apply", "pr-lifecycle -- create", "worker-execute -- run"]:
    assert forbidden not in orchestrator_apply_helper
for forbidden in ["task_update", "generate_task_packet", "gh pr merge", "git merge", "harness:merge -- apply"]:
    assert forbidden not in orchestrator_run_helper
for forbidden in ["task_update", "run_next_queue_job", "generate_task_packet", "gh pr merge"]:
    assert forbidden not in orchestrator_evidence_helper
for required in ["ALLOWED_SCRIPTS", "assertSafeDelegatedDryRunCommand", "MUTATING_VERBS", "writesFiles: false", "Delegated helper emitted invalid JSON"]:
    assert required in orchestrator_dry_run_helper
for required in ["OrchestratorApplyPath", "buildOrchestratorApplyPlan", "assertCreatedFilesWithinAllowlist", "afk_queue_materialization", "--queue-only", "screen_approval", "approvalRef"]:
    assert required in orchestrator_apply_helper
for required in ["OrchestratorRunLane", "queue_level", "worker_job", "parallel_lanes", "assertSafeDelegatedRunCommand", "defaultOrchestratorRunPreflight", "Phase 4 stops before merge by default", "harness:afk-orchestrate", "harness:worker-execute", "harness:parallel-worker-lanes"]:
    assert required in orchestrator_run_helper
for required in ["collectOrchestratorEvidence", "runOrchestratorMergeCheck", "runOrchestratorMergeApply", "assertNoRawGitMergeCommand", "harness:merge", "defaultStopBeforeMerge", "rawGitMergeUsed"]:
    assert required in orchestrator_evidence_helper
assert orchestrator_evidence_schema["properties"]["merge"]["properties"]["rawGitMergeUsed"]["const"] is False
for forbidden in ["harness:merge", "pr-lifecycle", "worker-execute", "git", ".pi/agent/state/runtime"]:
    assert forbidden in orchestrator_apply_helper
for required in ["read-only", "selectedPath", "clarification", "npm run harness:operator -- orchestrate classify", "npm run harness:orchestrate -- dry-run", "npm run harness:orchestrate -- apply", "npm run harness:orchestrate -- run", "npm run harness:orchestrate -- evidence", "npm run harness:orchestrate -- merge-check", "npm run harness:orchestrate -- merge-apply", "writesFiles: false", "exactly one allowlisted helper", "createdFiles", "--queue-only", "Phase 4", "Phase 5", "queue_level", "worker_job", "parallel_lanes", "merge.attempted: false", "stop-before-merge", "reports/orchestration", "rawGitMergeUsed: false"]:
    assert required in orchestrator_doc
assert "npm run harness:operator -- orchestrate classify" in operator_workflow_doc
assert "npm run harness:operator -- orchestrate dry-run" in operator_workflow_doc
assert "npm run harness:operator -- orchestrate apply" in operator_workflow_doc
assert "npm run harness:operator -- orchestrate run" in operator_workflow_doc
assert "npm run harness:operator -- orchestrate evidence" in operator_workflow_doc
assert "npm run harness:operator -- orchestrate merge-check" in operator_workflow_doc
assert "harness:product-pipeline" in package_json.get("scripts", {})
assert "harness:product-pipeline" in package_template_json.get("scripts", {})
assert "test:product-pipeline" in package_json.get("scripts", {})
assert "validate:product-pipeline" in package_json.get("scripts", {})
assert "product-pipeline" in (root / "scripts/harness-operator.ts").read_text(encoding="utf-8")
assert "product pipeline runtime" in team_orchestration_doc.lower()
assert "Phase 11 product pipeline runtime" in product_planning_doc
assert "Phase 11 product pipeline runtime" in readme_doc
phase_profiles = models_json.get("phase_routing_profiles", {})
assert set(phase_profiles) == {"screen_design", "frontend_implementation", "backend_implementation"}
for lane, expected_target, expected_model, expected_fallback in [
    ("screen_design", "gpt-5.5", "openai-codex/gpt-5.5", "openai-codex/gpt-5.5"),
    ("frontend_implementation", "gpt-5.3-codex-spark", "openai-codex/gpt-5.3-codex-spark", "openai-codex/gpt-5.5"),
    ("backend_implementation", "gpt-5.3-codex-spark", "openai-codex/gpt-5.3-codex-spark", "openai-codex/gpt-5.5"),
]:
    profile = phase_profiles[lane]
    assert profile["targetModelRequest"] == expected_target
    assert profile["verificationStatus"] == "verified"
    assert profile["verifiedModelId"] == expected_model
    assert profile["fallbackModelId"] == expected_fallback
    assert profile["thinking"] == "high"
    assert profile["thinking"] in profile["allowedThinking"]
    assert profile["activation"] == "fallback_until_verified"
for needle in [
    "phaseLane",
    "phase_routing_profiles",
    "Verified requested model IDs can become active defaults",
    "does not create task packets",
    "does not create queue jobs",
    "worker sessions",
]:
    assert needle in phase_model_routing_doc, needle
for needle in [
    "phaseLane",
    "phase_routing_profiles",
    "verified requested models can become active defaults",
    "no task packets",
    "queue jobs",
    "worker sessions",
]:
    assert needle in team_orchestration_doc, needle
assert "phase_model_routing.md" in readme_doc
assert "phase_model_routing.md" in operator_model_routing_doc
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
    "graphify-orchestrator.ts",
    "graphify-orchestrator.test.ts",
    "check_8_graphify_orchestrator_unit_tests",
]:
    assert needle in graphify_validator
for needle in [
    "check_9_graphify_validator_coverage_contract",
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

import re as _re
adr_index_doc = (root / "docs/adr/README.md").read_text(encoding="utf-8")
assert "ADR-0001" in adr_index_doc, "docs/adr/README.md index missing ADR-0001 entry"
agents_doc = (root / "AGENTS.md").read_text(encoding="utf-8")
assert "docs/adr/README.md" in agents_doc, "AGENTS.md missing cross-link to docs/adr/README.md"
assert "docs/adr/README.md" in readme_doc, "README.md missing cross-link to docs/adr/README.md"

adr_dir = root / "docs/adr"
adr_files = sorted(
    p.name for p in adr_dir.glob("*.md")
    if _re.match(r"^\d{4}-[a-z0-9-]+\.md$", p.name)
)
assert adr_files, "no NNNN-*.md ADR files found under docs/adr/"
allowed_statuses = {"Proposed", "Accepted", "Superseded", "Deprecated"}
for adr_filename in adr_files:
    adr_id = adr_filename.split("-", 1)[0]
    adr_label = f"ADR-{adr_id}"
    assert adr_label in adr_index_doc, (
        f"docs/adr/README.md index missing row for {adr_label} (file: {adr_filename})"
    )
    adr_text = (adr_dir / adr_filename).read_text(encoding="utf-8")
    status_match = _re.search(r"^\s*-\s*\*\*Status:\*\*\s*(\S+)", adr_text, _re.MULTILINE)
    assert status_match, f"{adr_filename} missing '- **Status:** <value>' line"
    assert status_match.group(1) in allowed_statuses, (
        f"{adr_filename} has unknown Status '{status_match.group(1)}'; "
        f"must be one of {sorted(allowed_statuses)}"
    )

fixture_adr_filename = "0004-apps-web-and-services-api-are-harness-fixtures.md"
fixture_banner = "HARNESS PILOT FIXTURE"
for fixture_readme in ("apps/web/README.md", "services/api/README.md"):
    fixture_doc = (root / fixture_readme).read_text(encoding="utf-8")
    assert fixture_banner in fixture_doc, (
        f"{fixture_readme} must contain the literal banner phrase {fixture_banner!r} "
        f"to make its harness-pilot status explicit (ADR-0004). A bare 'fixture' substring "
        f"elsewhere in the file is not sufficient."
    )
    assert fixture_adr_filename in fixture_doc, (
        f"{fixture_readme} must link to the ADR-0004 file (filename {fixture_adr_filename!r}) "
        f"so readers can find the binding decision"
    )

# The greenfield-scaffold initiative docs are the path operators reach via the
# root README's "Initiative overview" link. They must mention fixture status
# and link to ADR-0004 so a reader entering through the initiative does not
# miss the decision recorded in apps/web/README.md and services/api/README.md.
for greenfield_doc_relpath in (
    "docs/initiatives/greenfield-scaffold/README.md",
    "docs/initiatives/greenfield-scaffold/foundation-contract.md",
):
    greenfield_doc = (root / greenfield_doc_relpath).read_text(encoding="utf-8")
    assert "harness pilot fixture" in greenfield_doc.lower(), (
        f"{greenfield_doc_relpath} must mention 'harness pilot fixture' (per ADR-0004 lifecycle "
        f"step 3, contradicting docs must point at the ADR)"
    )
    assert fixture_adr_filename in greenfield_doc, (
        f"{greenfield_doc_relpath} must link to the ADR-0004 file (filename {fixture_adr_filename!r})"
    )
PY

"$REPO_ROOT/scripts/validate-prompt-contracts.sh"

"$REPO_ROOT/scripts/check-no-frontier-literals.sh"

echo "repo-static-checks-ok"
