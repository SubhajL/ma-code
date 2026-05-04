# Planning Log — tdd-guidance-propagation

- Date: 2026-05-04
- Scope: Propagate behavior-first TDD guidance across planning/build/implementation/review/validation prompt surfaces and task-packet policy, with cheap static enforcement and no packet schema migration.
- Status: ready
- Related coding log: `logs/coding/2026-05-04_tdd-guidance-propagation.md`

## Goal
- Make behavior-first TDD rules visible and consistent outside `g-coding` so planning/build packets, implementation workers, reviewer/validator guidance, and static checks reinforce the same contract.
- Keep the slice prompt/docs/policy-first; do not redesign runtime routing or add new typed packet schema fields.

## Scope
- Update prompt/skill/policy text only where it sharpens existing TDD expectations.
- Add RED-first static assertions in `scripts/check-repo-static.sh` before prompt/policy edits.
- Validate the new wording with cheap static/prompt/task-packet gates, then merge and sync local main.

## Files to Create or Edit
- `packages/pi-g-skills/skills/g-planning/SKILL.md`
- `.pi/agent/prompts/roles/planning_lead.md`
- `.pi/agent/prompts/roles/build_lead.md`
- `.pi/agent/prompts/roles/frontend_worker.md`
- `.pi/agent/prompts/roles/backend_worker.md`
- `.pi/agent/prompts/roles/infra_worker.md`
- `.pi/agent/prompts/roles/reviewer_worker.md`
- `.pi/agent/prompts/roles/validator_worker.md`
- `.pi/agent/skills/validation-checklist/SKILL.md`
- `.pi/agent/packets/packet-policy.json`
- `scripts/check-repo-static.sh`
- `logs/CURRENT.md`
- `reports/planning/2026-05-04_tdd-guidance-propagation-plan.md`
- `logs/coding/2026-05-04_tdd-guidance-propagation.md`

## Why Each File Exists
- `g-planning` + `planning_lead`: carry the TDD slice contract into planning outputs.
- `build_lead` + packet policy: preserve TDD slice, proof, and mock/refactor expectations in worker packets without schema churn.
- implementation worker prompts: enforce behavior-first TDD quality at execution time.
- reviewer/validator prompts + validation-checklist: challenge brittle or weak TDD evidence instead of only checking that tests ran.
- `check-repo-static.sh`: cheap guard against future drift.
- logs: capture bounded planning/coding evidence for this feature group.

## What Logic Belongs There
- Prompt/skill files: short enforceable TDD bullets and reference points, not runtime logic.
- Packet policy: stronger default evidence/validation/proof text using existing fields.
- Static checker: exact-string drift guards for the new TDD contract.

## What Should Not Go There
- No new typed task-packet schema fields in this slice.
- No runtime state-machine changes.
- No new queue/routing logic.
- No broad rewrite of docs outside surfaces directly carrying the TDD contract.

## Dependencies
- Existing TDD guidance in `packages/pi-g-skills/skills/g-coding/SKILL.md`
- `.pi/agent/docs/tdd_behavior_first_workflow.md`
- `.pi/agent/docs/deep_module_refactoring_workflow.md`
- Existing packet rendering in `.pi/agent/extensions/task-packets.ts`

## Acceptance Criteria
- Implementation worker prompts explicitly require behavior-first TDD, no speculative batching, public-interface/observable-behavior tests, boundary-only mocking by default, and GREEN-only refactoring.
- `g-planning`, `planning_lead`, and `build_lead` explicitly carry the TDD slice contract: first tracer behavior, public interface, boundary dependency/mock plan, and intentionally excluded behaviors.
- Reviewer/validator guidance and validation-checklist explicitly challenge implementation-coupled tests, unjustified owned-collaborator mocks, and missing RED/GREEN proof.
- Packet policy defaults use existing packet fields to carry the TDD slice/proof expectations without schema migration.
- `scripts/check-repo-static.sh` fails before the prompt/policy updates and passes after them.
- Validation and landing evidence are recorded; PR merges to main and local root main syncs.

## Likely Failure Modes
- Prompt bloat reduces clarity.
- Static assertions overfit exact strings and become noisy.
- Packet policy changes unintentionally break task-packet validation.
- Reviewer/validator wording becomes too subjective instead of evidence-based.

## Validation Plan
- RED: make `scripts/check-repo-static.sh` require the new TDD contract strings before updating prompt/policy surfaces.
- GREEN: run `bash scripts/check-repo-static.sh`, `bash scripts/validate-prompt-contracts.sh`, `bash scripts/validate-prompt-semantics.sh`, `bash scripts/validate-task-packets.sh`, and `git diff --check`.
- If touched surfaces require it after implementation, also run `bash scripts/validate-core-workflows.sh`.
- Finish with skeptical self-review/g-check-style review in the coding log, then commit/PR/merge/sync.

## Recommended Next Step
- Implement Option A from the review: prompt/docs/policy-only enhancement with static drift enforcement, then validate and land through the normal worktree/PR path.
