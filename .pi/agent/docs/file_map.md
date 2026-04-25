# File Map — Repo-Local GPT-5.4 First

## Update repo rules
- `AGENTS.md`

## Update Pi-wide project shaping
- `SYSTEM.md`

## Update role behavior
- `.pi/agent/prompts/roles/*.md`

## Update prompt-entry workflows
- `.pi/agent/prompts/templates/*.md`
- `.pi/agent/validation/prompt-contracts.json`

## Update routing defaults
- `.pi/agent/models.json`

## Update human-readable routing notes
- `.pi/agent/routing/*.md`
- `.pi/agent/docs/team_orchestration_architecture.md`

## Update team definitions
- `.pi/agent/teams/*.yaml`
- `.pi/agent/teams/*.json`

## Update packet structure and policy
- `.pi/agent/packets/*.json`
- `.pi/agent/state/schemas/task-packet.schema.json`

## Update handoff structure and policy
- `.pi/agent/handoffs/*.json`
- `.pi/agent/state/schemas/handoff.schema.json`

## Update task/queue structure
- `.pi/agent/state/schemas/*.json`
- `.pi/agent/state/runtime/*.json`
- `.pi/agent/schedules/*.json`
- `.pi/agent/validation/*.json`
- `.pi/agent/docs/task_schema_semantics.md`
- `.pi/agent/docs/queue_semantics.md`

## Update extension behavior and runtime controls
- `.pi/agent/extensions/*.spec.md`
- `.pi/agent/extensions/*.ts`
- `.pi/agent/extensions/bin/*`
- `.pi/agent/docs/auggie_mcp_integration_contract.md`
- `.pi/agent/docs/second_model_planning_contract.md`
- `.pi/agent/docs/auggie_and_second_model_usage.md`
- `.pi/agent/docs/same_runtime_bridge_architecture.md`

## Update validation workflow
- `.pi/agent/docs/runtime_validation_runbook.md`
- `.pi/agent/docs/operator_manual.md`
- `.pi/agent/docs/operator_workflow.md`
- `.pi/agent/docs/operator_quickstart.md`
- `.pi/agent/docs/operator_install_guide.md`
- `.pi/agent/docs/operator_provider_setup.md`
- `.pi/agent/docs/operator_model_routing_guide.md`
- `.pi/agent/docs/operator_role_guide.md`
- `.pi/agent/docs/operator_troubleshooting_guide.md`
- `.pi/agent/docs/operator_safety_rules.md`
- `.pi/agent/docs/operator_extension_guide.md`
- `.pi/agent/docs/operator_scheduled_workflows.md`
- `.pi/agent/docs/harness_package_install.md`
- `.pi/agent/docs/validation_architecture.md`
- `.pi/agent/docs/validation_recovery_architecture.md`
- `.pi/agent/docs/architecture_review_workflow.md`
- `.pi/agent/docs/audit_logging_convention.md`
- `.pi/agent/skills/validation-checklist/SKILL.md`
- `scripts/harness-operator-status.ts`
- `scripts/harness-queue-session.ts`
- `scripts/harness-package.ts`
- `scripts/harness-scheduled-workflows.ts`
- `scripts/harness-worktree.ts`
- `scripts/validate-phase-a-b.sh`
- `scripts/validate-skill-routing.sh`
- `scripts/validate-harness-routing.sh`
- `scripts/validate-team-activation.sh`
- `scripts/validate-task-packets.sh`
- `scripts/validate-handoffs.sh`
- `scripts/validate-same-runtime-bridge.sh`
- `scripts/validate-recovery-policy.sh`
- `scripts/validate-recovery-runtime.sh`
- `scripts/validate-queue-runner.sh`
- `scripts/validate-prompt-contracts.sh`
- `scripts/validate-harness-package.sh`
- `reports/validation/*.md`
- `reports/validation/*.json`

## Update roadmap interpretation and capability expectations
- `.pi/agent/package/*.json`
- `.pi/agent/package/templates/*`
- `.pi/agent/docs/harness_phase_capability_map.md`
- `.pi/agent/docs/worktree_isolation_policy.md`
- `.pi/agent/docs/bounded_autonomy_architecture.md`
- `.pi/agent/docs/operator_control_model.md`
- `.pi/agent/docs/harness_packaging_strategy.md`
- `.pi/agent/docs/codex_skill_patterns_for_pi_harness.md`
- `.pi/agent/docs/architecture_review_workflow.md`

## Update logs and evidence trail
- `logs/CURRENT.md`
- `logs/coding/*.md`
- `reports/planning/*.md`

## File type policy
- `.ts` = runtime behavior
- `.md` = prompts, roles, policy, docs, reports
- `.json` = config/state/validation summaries
- `.yaml` = team configuration
