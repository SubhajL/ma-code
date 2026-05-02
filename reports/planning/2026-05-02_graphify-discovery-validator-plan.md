# Planning Log — graphify-discovery-validator

- Date: 2026-05-02
- Scope: Add a canonical Graphify validation command plus prompt-contract/static enforcement for Graphify skepticism/routing.
- Status: ready
- Related coding log: `logs/coding/2026-05-02_graphify-discovery-validator.md`

## Goal
- Provide one canonical Graphify validation command and tighten prompt-contract/static enforcement for Graphify review/validation skepticism.

## Scope
- Add `scripts/validate-graphify-discovery.sh`.
- Wire it into package/docs/static validation surfaces.
- Update targeted role prompts and prompt contracts.

## Files to Create or Edit
- `scripts/validate-graphify-discovery.sh`
- `.pi/agent/validation/prompt-contracts.json`
- `.pi/agent/prompts/roles/orchestrator.md`
- `.pi/agent/prompts/roles/reviewer_worker.md`
- `.pi/agent/prompts/roles/validator_worker.md`
- `package.json`
- `README.md`
- `.pi/agent/docs/validation_architecture.md`
- `.pi/agent/docs/operator_workflow.md`
- `.pi/agent/docs/file_map.md`
- `logs/CURRENT.md`
- `reports/planning/2026-05-02_graphify-discovery-validator-plan.md`
- `logs/coding/2026-05-02_graphify-discovery-validator.md`

## Why Each File Exists
- Validator script: canonical operator/local validation path.
- Prompt contracts + role prompts: enforce Graphify skepticism/routing in static validation.
- Package/docs: discoverability and operator guidance.
- Logs: Pi-style planning/coding evidence.

## What Logic Belongs There
- Focused Graphify compile/unit/integration/smoke validation.
- Minimal prompt-contract enforcement for Graphify-specific language in targeted roles.
- Canonical command wiring only.

## What Should Not Go There
- No broad Graphify adapter redesign.
- No auto-install behavior.
- No unrelated prompt cleanup.

## Dependencies
- Existing Graphify adapter runtime and tests.
- Existing prompt-contract validation framework.
- Existing report-style validator script patterns.

## Acceptance Criteria
- Canonical Graphify validator exists and passes locally.
- Prompt-contract validation fails if targeted Graphify skepticism/routing text is removed.
- Docs/package wiring exposes one canonical Graphify validation command.

## Likely Failure Modes
- Prompt-contract checks become too brittle.
- Smoke path pollutes source diff.
- Graphify validation script duplicates too much unrelated validator behavior.

## Validation Plan
- RED: new validator and prompt-contract checks fail before implementation text/wiring exists.
- GREEN: focused validator, prompt contracts, repo static, and compile/unit/integration checks pass.
- Flake check: 3 consecutive passes for the changed local validation scope.

## Recommended Next Step
- Implement in the dedicated non-main worktree using strict tests-first sequencing and land via PR once focused validation and g-check pass.
