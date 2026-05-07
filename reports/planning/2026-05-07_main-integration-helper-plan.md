# Planning Log — main-integration-helper

- Date: 2026-05-07
- Scope: Safe local-main integration helper for validated worktree branches
- Status: ready
- Related coding log: `logs/coding/2026-05-07_main-integration-helper.md`

## Goal
- Add a bounded runtime tool that integrates a validated worktree branch into local `main` with fast-forward-only safety, without relying on raw `git merge` shell usage on `main`.

## Scope
- Add a new integration helper script and package aliases.
- Reuse worktree review-prep for source branch readiness.
- Reuse/extend execution leases for integration ownership.
- Run post-merge validator with explicit temp report paths when the validator script exists.
- Add docs and validator wiring.

## Files to Create or Edit
- `.pi/agent/extensions/execution-leases.ts`
- `tests/extension-units/execution-leases.test.ts`
- `scripts/harness-sync-main.ts`
- `scripts/harness-integrate.ts`
- `tests/integration/integrate-worktree.test.ts`
- `package.json`
- `scripts/validate-core-workflows.sh`
- `README.md`
- `.pi/agent/docs/operator_quickstart.md`
- `.pi/agent/docs/operator_workflow.md`
- `.pi/agent/docs/operator_manual.md`
- `logs/CURRENT.md`

## Why Each File Exists
- `harness-integrate.ts`: bounded local-main integration surface.
- `execution-leases.ts`: authoritative integration lease.
- `harness-sync-main.ts`: source of root cleanliness logic; may need small export reuse.
- tests: prove FF-only success, dirty blocking, and allowlisted generated artifact handling.
- validator/docs/package: wire the new surface into operator workflows.

## What Logic Belongs There
- Integration helper owns branch/worktree readiness, main cleanliness, FF-only merge, optional post-merge validation, and structured results.
- Lease helper owns exclusive integration scope semantics.
- Worktree helper remains authoritative for source worktree readiness via review-prep.

## What Should Not Go There
- No push, PR creation, or remote merge.
- No auto-resolution of merge conflicts.
- No bypass of dirty tracked root state.
- No repeated live/provider validation.

## Dependencies
- Existing worktree helper review-prep logic.
- Existing sync-main tracked dirt logic.
- Existing validation scripts, especially `validate-core-workflows.sh`.

## Acceptance Criteria
- A clean validated worktree branch can be integrated into local main with FF-only merge through the new helper.
- Dirty tracked root main still blocks.
- Allowlisted generated validation report artifacts do not block integration.
- Post-merge validation writes to temp/non-repo paths by default.

## Likely Failure Modes
- Integrating from a dirty/unreviewed source worktree.
- Non-fast-forward merge attempts.
- Leaving integration lease behind on failure.
- Root validator report paths creating new repo dirt.

## Validation Plan
- RED: new `tests/integration/integrate-worktree.test.ts` before script exists.
- GREEN:
  - `node --import tsx --test tests/integration/integrate-worktree.test.ts`
  - `node --import tsx --test tests/integration/sync-main.test.ts`
  - `node --import tsx --test tests/extension-units/execution-leases.test.ts`
  - `./scripts/validate-core-workflows.sh`

## Recommended Next Step
- Add failing integration test for FF-only worktree integration, then implement the smallest helper.
