# Planning Log — harness-048-structured-queue-quality

- Date: 2026-04-29
- Scope: Make one bounded queue→quality runtime path consume structured worker-to-quality handoff data instead of ad hoc queue-job prose, and block the transition when required structured data is missing.
- Status: ready
- Related coding log: `logs/coding/2026-04-29_harness-048-structured-queue-quality.md`

## Goal
- Make the queue runner consume structured handoff fields for at least one real queue→quality transition.
- Reject or block the transition when the required structured handoff object is missing or malformed.
- Preserve the bounded queue-runner model instead of redesigning broader orchestration.

## Scope
- Add a bounded structured `qualityInput` queue-job shape for quality-lane jobs.
- Make quality queue-job packet generation derive from `worker_to_quality` handoff structure rather than free-form queue-job summaries.
- Add focused unit and integration proof for both success and rejection paths.
- Update queue schema/docs for the new executable job field.

## Files to Create or Edit
- `.pi/agent/extensions/queue-runner.ts`
- `.pi/agent/state/schemas/queue.schema.json`
- `.pi/agent/docs/queue_semantics.md`
- `.pi/agent/docs/bounded_autonomy_architecture.md`
- `tests/extension-units/queue-runner.test.ts`
- `tests/integration/core-workflows.test.ts`

## Why Each File Exists
- `queue-runner.ts`: runtime enforcement and structured field consumption.
- `queue.schema.json`: executable queue-job contract for the new quality input object.
- `queue_semantics.md`: operator/runtime contract explanation for the new field.
- `bounded_autonomy_architecture.md`: note that queue→quality now consumes structured handoffs and blocks missing structure.
- `queue-runner.test.ts`: focused RED/GREEN unit proof for start/block behavior.
- `core-workflows.test.ts`: focused integration proof for a real queue→quality start path.

## What Logic Belongs There
- `queue-runner.ts`: validate a structured `worker_to_quality` handoff for quality jobs and derive packet inputs from preserved packet + handoff details.
- tests: prove that a quality job can start without ad hoc `allowedPaths/domains` when structured input is present, and that the runner blocks missing structured input.

## What Should Not Go There
- No broader autonomous quality-job creation pipeline.
- No prompt-only quality normalization changes.
- No daemon/scheduler redesign.
- No direct edits to runtime task JSON outside task tools.

## Dependencies
- Existing `task-packets.ts` generator and packet policy defaults.
- Existing `handoffs.ts` structured handoff shape/validation.
- Existing queue runner and core workflow validators.

## Acceptance Criteria
- At least one bounded queue→quality flow is driven by structured fields from a `worker_to_quality` handoff.
- The queue runner blocks the quality transition when required structured fields are missing or invalid.
- Runtime prefers structured IDs/objects (`sourcePacketId`, structured handoff object) over rendered prose for the targeted path.
- Focused unit and integration proof both pass.

## Likely Failure Modes
- Quality packet generation still accidentally depends on free-form queue-job `allowedPaths` or `scope`.
- Missing/malformed handoff data silently falls back instead of blocking.
- Derived quality packet fields lose important scope or proof data from the preserved packet.
- Test fixtures generate incomplete handoffs that fail for unrelated reasons.

## Validation Plan
- RED: run targeted queue-runner unit test scope and/or core-workflows test scope with new expectations before implementation is complete.
- GREEN: `bash scripts/check-foundation-extension-compile.sh`
- GREEN: `bash scripts/validate-extension-unit-tests.sh`
- GREEN: `bash scripts/validate-core-workflows.sh`
- GREEN: `bash scripts/validate-queue-runner.sh --skip-live`

## Recommended Next Step
- Implement a bounded `qualityInput` queue-job contract in `queue-runner.ts`, then add success/rejection tests before broader validation.
