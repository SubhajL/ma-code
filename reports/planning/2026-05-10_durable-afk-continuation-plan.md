# Durable AFK Continuation Plan

## Discovery Path
- Used `g-planning`/`g-coding` workflow.
- Auggie discovery attempted for HITL/AFK/queue paths and timed out; used local inspection fallback.
- Inspected `.pi/agent/extensions/afk-orchestration.ts`, `.pi/agent/extensions/queue-runner.ts`, `scripts/harness-afk-orchestrate.ts`, `tests/extension-units/afk-orchestration.test.ts`, `tests/extension-units/queue-runner.test.ts`, and issue-materialization tests.

## Goal
- Make AFK continuation durable after HITL approval lands on main.
- Let AFK orchestration apply a landed approval artifact to resolve HITL dependencies.
- Requeue stale blocked AFK jobs through queue-runner materialization, not raw runtime JSON edits.
- Keep issue/roadmap materialization on existing durable artifact path.

## Non-Goals
- No UI changes.
- No live provider/worker execution loop changes.
- No direct edits to `.pi/agent/state/runtime/*.json` as an operator path.
- No schema/deployment/secrets changes.

## Assumptions
- Landed approval evidence can live under the initiative directory as `docs/initiatives/<initiative>/afk-approvals.json`.
- HITL approval resolves only HITL/approval-gated issue blockers; it does not mark normal AFK implementation issues complete.
- Existing `harness-issue-materialize` remains the roadmap/prose-to-durable-issues path.

## Cross-Model Check
- Not run; scope was bounded and existing AFK/queue surfaces were directly inspectable.

## Plan Draft A
- Add durable approval artifact reader to AFK orchestration.
- Treat approved HITL dependencies as resolved when selecting AFK-eligible issues.
- Include the approval artifact in queue job provenance.
- Enhance queue materialization to requeue existing blocked jobs whose source issue is now eligible.

## Plan Draft B
- Add a new standalone approval command/tool that mutates runtime queue state directly.
- Have the operator run that command before bounded queue sessions.
- Leave AFK issue selection unchanged.

## Unified Plan
- Use Draft A: keep the landed source of truth in initiative artifacts and apply it through the existing AFK/queue materialization path.
- Avoid direct runtime JSON repair paths.
- Preserve bounded queue-session semantics.

## Files to Modify
- `.pi/agent/extensions/afk-orchestration.ts`
- `.pi/agent/extensions/queue-runner.ts`
- `tests/extension-units/afk-orchestration.test.ts`
- `reports/planning/2026-05-10_durable-afk-continuation-plan.md`
- `logs/coding/2026-05-10_durable-afk-continuation.md`
- `logs/CURRENT.md`

## New Files
- `reports/planning/2026-05-10_durable-afk-continuation-plan.md`
- `logs/coding/2026-05-10_durable-afk-continuation.md`

## TDD Sequence
1. Add failing AFK orchestration tests for durable HITL approval resolving issue dependencies and approval provenance.
2. Add failing AFK orchestration test for applying materialization over a stale blocked queue job.
3. Run targeted RED command and confirm failure is approval/requeue behavior missing.
4. Implement smallest AFK approval reader/resolution logic and queue requeue behavior.
5. Run targeted GREEN tests and broader queue/issue materialization validation.
6. Run changed AFK test scope three consecutive times.

## Test Coverage
- Unit coverage for durable `afk-approvals.json` application.
- Unit coverage for stale blocked queue job requeue through `materializeQueueJobs`.
- Existing queue-runner tests for queue behavior regression.
- Existing issue-materialization integration test for durable issue artifact path.

## Acceptance Criteria
- Planning/coding logs updated with lifecycle evidence.
- Runtime path applies landed HITL approval evidence from initiative artifacts.
- Stale blocked AFK jobs are requeued by normal queue materialization.
- Roadmap/prose issue materialization path remains validated.
- Targeted RED/GREEN and relevant gates are recorded.

## Wiring Checks
| Component | Entry point | Registration/location | Verification |
| --- | --- | --- | --- |
| Durable AFK approval reader | `runAfkOrchestration` | `.pi/agent/extensions/afk-orchestration.ts` | AFK unit test includes `afk-approvals.json` in source provenance and resolves HITL dependency. |
| Stale blocked job requeue | `materializeQueueJobs` | `.pi/agent/extensions/queue-runner.ts` | AFK apply unit test writes blocked fixture and verifies resulting queue job status is `queued`. |
| Roadmap/issues materialization | `scripts/harness-issue-materialize.ts` | existing operator/script path | `tests/integration/issue-materialization.test.ts` passes. |

## Validation
- `node --import tsx --test --test-name-pattern 'durable AFK approvals' tests/extension-units/afk-orchestration.test.ts` RED failed because durable approval was not applied.
- `node --import tsx --test tests/extension-units/afk-orchestration.test.ts` passed after implementation.
- `node --import tsx --test tests/extension-units/queue-runner.test.ts` passed.
- `node --import tsx --test tests/integration/issue-materialization.test.ts` passed.
- `TSX_IMPORT_PATH=/Users/subhajlimanond/dev/ma-code/node_modules/tsx/dist/loader.mjs node --import /Users/subhajlimanond/dev/ma-code/node_modules/tsx/dist/loader.mjs --test tests/extension-units/afk-orchestration.test.ts tests/integration/afk-orchestration.test.ts` passed three consecutive runs.

## Risks
- `afk-approvals.json` is a new convention and should be documented if expanded beyond AFK orchestration.
- Approval artifacts intentionally resolve HITL blockers only; normal AFK issues still require implementation completion evidence.

## Pi Log Update
- Planning log: `reports/planning/2026-05-10_durable-afk-continuation-plan.md`
- Coding log: `logs/coding/2026-05-10_durable-afk-continuation.md`
- Intake required: no; direct implementation followed from user-requested bounded follow-up and active task `task-1778377949313`.
- First TDD slice: durable HITL approval resolves `issue-001` and materializes/requeues downstream AFK jobs through public AFK/queue runner entry points.
