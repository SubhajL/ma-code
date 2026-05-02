# Planning Log — graphify-product-planning-phase1

- Date: 2026-05-02
- Scope: Phase 1 prompt/docs adaptation for Graphify optional fallback, product planning workflow, deep-module refactoring vocabulary, and behavior-first TDD guidance.
- Status: ready
- Related coding log: `logs/coding/2026-05-02_graphify-product-planning-phase1.md`

## Goal
- Implement Phase 1 only from the Graphify/product-planning integration plan.
- Add documentation and prompt guidance without adding runtime Graphify tools or new skill ports.

## Scope
- Add Graphify optional-fallback policy docs.
- Add product-planning workflow docs for grill-style clarification, PRD synthesis, and vertical-slice backlog planning.
- Add deep-module refactoring vocabulary docs.
- Add behavior-first TDD docs and update `g-coding`.
- Update planning/research role guidance and operator docs.
- Add static validation expectations so missing docs/guidance fail.

## Files to Create or Edit
- `scripts/check-repo-static.sh`
- `.pi/agent/docs/graphify_discovery_research.md`
- `.pi/agent/docs/product_planning_workflow.md`
- `.pi/agent/docs/deep_module_refactoring_workflow.md`
- `.pi/agent/docs/tdd_behavior_first_workflow.md`
- `.pi/agent/prompts/roles/planning_lead.md`
- `.pi/agent/prompts/roles/research_worker.md`
- `packages/pi-g-skills/skills/g-coding/SKILL.md`
- `packages/pi-g-skills/skills/g-planning/SKILL.md`
- `packages/pi-g-skills/skills/g-review/SKILL.md`
- `.pi/agent/docs/operator_workflow.md`
- `.pi/agent/docs/operator_role_guide.md`
- `.pi/agent/docs/codex_skill_patterns_for_pi_harness.md`
- `.pi/agent/docs/validation_architecture.md`
- `.pi/agent/docs/file_map.md`
- `README.md`
- `logs/CURRENT.md`
- `logs/coding/2026-05-02_graphify-product-planning-phase1.md`

## Why Each File Exists
- Static gate: enforces the new Phase 1 docs and prompt guidance remain present.
- Role prompts: make Graphify owned by research/system-analysis and consumed by planning.
- Skill docs: keep g-planning/g-review/g-coding behavior aligned with the new policy.
- Operator docs: give humans the workflow and boundaries.
- File map/README: make new docs discoverable.
- Logs: preserve task evidence.

## What Logic Belongs There
- Prompt/docs guidance only.
- No runtime Graphify adapter.
- No auto-install behavior.
- No new skill ports.

## What Should Not Go There
- `graphify_status`, `graphify_discover`, or `graphify_query` runtime tools.
- Graphify install automation.
- Watchers, hooks, MCP server startup, or Neo4j push behavior.
- Issue tracker publishing.

## Dependencies
- Existing prompt-contract/static validator surface.
- Current role prompts and g-* skill package.

## Acceptance Criteria
- Static checks fail before required docs/guidance exist.
- Static checks pass after docs/prompt updates.
- Phase 1 docs are discoverable from README/file map/operator docs.
- Graphify guidance remains optional and bounded.
- TDD guidance includes one-test-at-a-time behavior-first rules.

## Likely Failure Modes
- Accidentally implying Graphify replaces Exa.
- Accidentally adding Phase 2/3 runtime or skill-port scope.
- Static expectations become too brittle or too broad.
- TDD guidance conflicts with existing RED/GREEN evidence rules.

## Validation Plan
- RED: `bash scripts/check-repo-static.sh` after adding static expectations, before adding docs.
- GREEN: `bash scripts/check-repo-static.sh` after implementation.
- Focused checks: `bash scripts/validate-prompt-contracts.sh`, `git diff --check`.

## Recommended Next Step
- Complete static/doc implementation and run focused validation.
