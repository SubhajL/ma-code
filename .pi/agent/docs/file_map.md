# File Map — Repo-Local GPT-5.4 First

## Update repo rules
- `AGENTS.md`

## Update Pi-wide project shaping
- `SYSTEM.md`

## Update role behavior
- `.pi/agent/prompts/roles/*.md`

## Update prompt-entry workflows
- `.pi/agent/prompts/templates/*.md`

## Update routing defaults
- `.pi/agent/models.json`

## Update human-readable routing notes
- `.pi/agent/routing/*.md`
- `.pi/agent/docs/team_orchestration_architecture.md`

## Update team definitions
- `.pi/agent/teams/*.yaml`

## Update task/queue structure
- `.pi/agent/state/schemas/*.json`
- `.pi/agent/state/runtime/*.json`
- `.pi/agent/docs/task_schema_semantics.md`
- `.pi/agent/docs/queue_semantics.md`

## Update extension behavior and runtime controls
- `.pi/agent/extensions/*.spec.md`
- `.pi/agent/extensions/*.ts`
- `.pi/agent/extensions/bin/*`
- `.pi/agent/docs/auggie_mcp_integration_contract.md`
- `.pi/agent/docs/second_model_planning_contract.md`
- `.pi/agent/docs/auggie_and_second_model_usage.md`

## Update validation workflow
- `.pi/agent/docs/runtime_validation_runbook.md`
- `.pi/agent/docs/operator_workflow.md`
- `.pi/agent/docs/validation_architecture.md`
- `.pi/agent/docs/validation_recovery_architecture.md`
- `.pi/agent/docs/audit_logging_convention.md`
- `scripts/validate-phase-a-b.sh`
- `scripts/validate-skill-routing.sh`
- `scripts/validate-harness-routing.sh`
- `reports/validation/*.md`
- `reports/validation/*.json`

## Update roadmap interpretation and capability expectations
- `.pi/agent/docs/harness_phase_capability_map.md`
- `.pi/agent/docs/worktree_isolation_policy.md`
- `.pi/agent/docs/bounded_autonomy_architecture.md`
- `.pi/agent/docs/operator_control_model.md`
- `.pi/agent/docs/harness_packaging_strategy.md`
- `.pi/agent/docs/codex_skill_patterns_for_pi_harness.md`

## Update logs and evidence trail
- `logs/CURRENT.md`
- `logs/coding/*.md`
- `reports/planning/*.md`

## File type policy
- `.ts` = runtime behavior
- `.md` = prompts, roles, policy, docs, reports
- `.json` = config/state/validation summaries
- `.yaml` = team configuration
