# Selected Worker Model Enforcement Plan

- Date: 2026-05-18
- Task: `task-1779100931059`
- Coding log: `logs/coding/2026-05-18_selected-worker-model-enforcement.md`
- Intake: direct user request to plan, implement, create PR, admin merge, and sync local main.
- Direct-implementation exemption: implementation requested in same turn; plan is recorded before code changes.

## Discovery Path
- Read `logs/CURRENT.md` and repo status.
- Auggie attempted first and timed out; local fallback inspection used.
- Inspected worker execution, same-runtime child invocation, queue selected model propagation, worker CLI, and tests.
- Second-model planning attempted; unavailable/timed out or provider auth/credits blocked, so this plan is single-model.

## Goal
- Enforce selected worker model execution at runtime.
- If a queue job has `selectedModelId`, implementation must either use a worker execution plan that launches the exact provider/model, or block before implementation with selected-model-not-executed evidence.
- Worker run artifacts must distinguish caller/current session model, selected worker model, planned child model, actual executed model, and missing/not-launched state.

## Non-Goals
- Do not redesign the queue scheduler.
- Do not make the current parent session switch models mid-session.
- Do not add broad daemon/autonomous draining.
- Do not touch unrelated dirty primary-worktree changes.

## Plan Draft A
- Enforce in `worker-execution.ts` only:
  - add `modelExecution` evidence to worker run artifacts;
  - block selected-model jobs without a same-runtime worker execution plan;
  - block mismatched planned child model;
  - mark matched actual model after child execution.

## Plan Draft B
- Enforce earlier in `queue-runner.ts` before task start:
  - block jobs that route to a selected model but lack an executable child worker plan;
  - add queue job selected thinking metadata;
  - still keep worker execution enforcement as defense-in-depth.

## Unified Plan
- Implement Draft A first as the smallest runtime enforcement at the actual implementation boundary.
- Add queue metadata where low risk (`selectedThinkingLevel`) if needed for thinking evidence.
- Keep queue-runner scheduler behavior otherwise unchanged for this slice.

## TDD Slice
- First tracer behavior: worker execution blocks a selected-model queue job before implementation when no child worker plan is available.
- Public interface: `runWorkerExecution()` with fixture queue job containing `selectedModelId`.
- Boundary dependencies: fake same-runtime executor for child execution; temp git/runtime fixtures.
- Out of scope: provider API live validation and full scheduler redesign.

## Acceptance Criteria
- RED/GREEN tests cover missing child plan, mismatched child model, and matched child model.
- Worker artifacts include selected/planned/actual model evidence.
- Matching plan uses child execution path and records actual model.
- Mismatch/missing plan blocks before implementation mutation.
- PR is created, admin-merged by explicit user instruction, and local main synced.
