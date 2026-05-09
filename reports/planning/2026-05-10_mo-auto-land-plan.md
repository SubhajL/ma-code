# MO Auto-Land and AFK Continuation Plan

## Discovery Path
- Auggie attempted and timed out; used local targeted inspection.
- Inspected orchestrator run, worker execution, PR lifecycle, merge helper, sync-main, and orchestrator tests.

## Goal
- Let Master Orchestrator auto-land a bounded worker job when explicitly approved.
- Sequence worker execution -> PR lifecycle create -> PR gate -> merge-ready -> bounded merge -> optional sync-main.
- Preserve conservative stop-before-PR/merge defaults without approval.

## Non-Goals
- No unconditional merge bypass.
- No auto-land for parallel lanes in this slice.
- No direct GitHub merge outside the existing PR lifecycle / merge helper gates.

## Draft A
- Put the full chain in `worker-execution`.
- Pro: worker owns lifecycle after implementation.
- Con: violates existing separation; worker executor would create/merge PRs.

## Draft B
- Put the chain in `orchestrator-run` as an approved policy mode.
- Pro: MO coordinates phases; PR lifecycle and merge helper keep their gates.
- Con: only worker_job lane can auto-land initially.

## Unified Plan
- Add `--auto-land`, `--approval-ref`, `--sync-main`, and `--merge-method` to `harness-orchestrate run`.
- Support auto-land only for `worker_job` lane.
- Require approvalRef for auto-land.
- Pass `--no-stop-before-pr --allow-pr-create --approval-ref` to worker execution.
- Then run `harness:pr-lifecycle` commands: create, gate, merge-ready, merge, sync-main.
- Block and surface evidence if any gate fails.

## TDD Slice
- First tracer behavior: approved worker_job auto-land produces six delegated calls and completes with PR/merge/sync evidence.
- Public interface: `runOrchestratorRun(...)` and `scripts/harness-orchestrate.ts run --auto-land`.
- Boundary dependencies: fake runner/fake npm scripts; no live GitHub in tests.
- Out of scope: live PR creation and real CI waits.

## Acceptance Criteria
- No approval: auto-land blocks before delegated mutation.
- Non-worker lane: auto-land blocks.
- Approved worker_job: runs worker, PR create, gate, merge-ready, merge, sync-main.
- Merge uses PR lifecycle / bounded merge helper path, not raw `git merge`.
- Existing default run behavior remains stop-before-PR.

## Validation
- `TSX_IMPORT_PATH=/Users/subhajlimanond/dev/ma-code/node_modules/tsx/dist/loader.mjs node --import /Users/subhajlimanond/dev/ma-code/node_modules/tsx/dist/loader.mjs --test tests/extension-units/orchestrator-run.test.ts tests/integration/orchestrator-run.test.ts`
- `git diff --check`

## Cross-Model Check
- Ran `second_model_plan` after implementation for risk review.
- Agreement: Draft B/orchestrator-run coordination is the right layer; approvalRef and PR lifecycle gates should remain mandatory.
- Added caution: live/staging end-to-end proof is still needed before trusting auto-land for unattended production merges.
