# Planning Log — harness-048-structured-quality-next-step

- Date: 2026-04-29
- Scope: Plan the bounded HARNESS-048 slice that extends structured runtime enforcement from queued `quality_lead` jobs to one next-step quality transition.
- Status: ready
- Related coding log: `logs/coding/2026-04-29_harness-048-structured-quality-next-step.md`

## Goal
- Extend the stronger structured handoff contract into one next quality-stage runtime transition without broadening into full orchestration automation.
- Make one queued `validator_worker` quality-lane job consume a structured `quality_to_validator` handoff object instead of ad hoc queue-job prose.
- Block the transition when the structured next-step input is missing or malformed.

## Scope
- Reuse the existing queue-job `qualityInput` field rather than inventing a second field.
- Expand `qualityInput` semantics from queued `quality_lead` jobs only to one additional bounded role: queued `validator_worker` jobs on the quality team.
- Derive the validator packet from `quality_to_validator` handoff structure plus the preserved packet.
- Add focused unit and integration proof for the success and rejection paths.
- Update queue schema/docs/static semantics checks to match the widened but still bounded `qualityInput` contract.

## Files to Create or Edit
- `.pi/agent/extensions/queue-runner.ts`
- `.pi/agent/state/schemas/queue.schema.json`
- `.pi/agent/docs/queue_semantics.md`
- `.pi/agent/docs/bounded_autonomy_architecture.md`
- `tests/extension-units/queue-runner.test.ts`
- `tests/integration/core-workflows.test.ts`
- `scripts/validate-queue-semantics.sh`
- `logs/coding/2026-04-29_harness-048-structured-quality-next-step.md`

## Why Each File Exists
- `queue-runner.ts`: runtime enforcement and packet derivation from structured `quality_to_validator` handoff objects.
- `queue.schema.json`: executable queue-job contract for the widened `qualityInput` semantics.
- queue docs: operator/runtime explanation of where `qualityInput` is now allowed and what handoff types/roles it must match.
- tests: focused RED/GREEN proof for one bounded structured quality→validator pickup path.
- `validate-queue-semantics.sh`: keep schema/doc drift visible.
- coding log: record the bounded implementation evidence through review/merge.

## What Logic Belongs There
- recognize queued quality-team `validator_worker` jobs as eligible for structured `qualityInput` consumption
- validate that `qualityInput.sourceHandoff` is a `quality_to_validator` handoff targeting `validator_worker`
- derive packet goal, files to inspect, expected proof, validation expectations, and parent packet linkage from preserved packet + handoff details
- block the queue transition with a specific reason when the structured next-step input is missing or malformed

## What Should Not Go There
- no hidden daemon or broader multi-agent dispatch
- no free-form fallback to rendered handoff prose
- no automatic quality-lead completion that enqueues reviewer/validator jobs
- no unrelated stop-budget-control work from HARNESS-049
- no simultaneous reviewer + validator runtime generalization in this slice

## Dependencies
- landed HARNESS-048 slice 1 queue→quality runtime path
- existing `quality_to_validator` handoff generator/validator in `.pi/agent/extensions/handoffs.ts`
- existing queue-runner/core-workflows validation scripts
- isolated worktree `/Users/subhajlimanond/dev/ma-code-worktrees/task-1777608636365-harness-048-quality-next-step`

## Acceptance Criteria
- At least one bounded queued quality→validator transition is driven by structured handoff fields rather than prose summaries.
- The queue runner rejects or blocks queued `validator_worker` quality jobs when the required structured `quality_to_validator` input is missing or malformed.
- The generated validator packet preserves parent-packet linkage and derives bounded packet fields from the structured handoff/preserved packet.
- Focused unit and integration proof demonstrate both the structured transition and the rejection path.
- Change is ready to land through PR/merge and local-main sync after review and validation.

## Likely Failure Modes
- widening into a generic handoff-input abstraction for all future quality roles
- reusing `qualityInput` but still allowing prose-only fallback for validator jobs
- deriving validator packet fields from job prose instead of the structured handoff
- docs/schema describing broader support than runtime actually enforces
- choosing the reviewer path too and doubling surface area mid-slice

## Validation Plan
- RED:
  - add one unit test proving a queued `validator_worker` job with only structured `qualityInput` should start and preserve `parentPacketId`, then confirm current runtime fails
  - add one unit test proving a queued `validator_worker` job without structured `qualityInput` should block for a validator-specific structured-input reason, then confirm current runtime fails
  - add matching integration scenarios in `tests/integration/core-workflows.test.ts`
- GREEN:
  - `bash scripts/check-foundation-extension-compile.sh`
  - `bash scripts/validate-extension-unit-tests.sh`
  - `bash scripts/validate-core-workflows.sh`
  - `bash scripts/validate-queue-runner.sh --skip-live`
  - `bash scripts/validate-queue-semantics.sh`
  - `bash scripts/check-repo-static.sh`
  - `git diff --check`

## Recommended Next Step
- Keep the plan bounded to `quality_to_validator`, then switch to g-coding in this worktree for TDD implementation, g-check review, PR/merge, and local-main sync.
