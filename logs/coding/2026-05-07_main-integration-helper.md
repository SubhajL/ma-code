# Coding Log — main-integration-helper

- Date: 2026-05-07
- Scope: Safe local-main integration helper for validated worktree branches
- Status: in_progress
- Branch: `split/task-1778124392245-main-integration-helper`
- Related planning log: `reports/planning/2026-05-07_main-integration-helper-plan.md`

## Task Group
- Implement a bounded runtime helper that integrates validated worktree branches into local main.

## Files Investigated
- `logs/CURRENT.md`
- `scripts/harness-sync-main.ts`
- `tests/integration/sync-main.test.ts`
- `scripts/validate-core-workflows.sh`
- `package.json`

## Files Changed
- `reports/planning/2026-05-07_main-integration-helper-plan.md`: created bounded plan.
- `logs/coding/2026-05-07_main-integration-helper.md`: created evidence log.
- `logs/CURRENT.md`: to be updated to this feature group.

## Runtime / Validation Evidence
- Discovery: `auggie_discover` attempted first; unavailable due account credits; continued with targeted reads.
- Root before worktree: clean `main`, ahead of `origin/main` by 2.
- Worktree created at `/Users/subhajlimanond/dev/ma-code-worktrees/task-1778124392245-main-integration-helper`.

## Key Findings
- `harness-sync-main.ts` already contains the tracked-dirt policy needed for safe main mutation.
- `harness-worktree.ts` already provides review-prep, which is the right source branch seam.
- Existing validators default to repo-local report paths; this is part of the automation friction and should be overridden by the integration helper.

## Decisions Made
- Add a dedicated `harness-integrate` surface rather than expanding `sync-main` into local branch integration.
- Use one integration lease to serialize merges to local main.
- Tolerate only narrow allowlisted generated validation artifacts in root when integrating.

## Known Risks
- Need to keep source-branch readiness bounded and evidence-based.
- Need to avoid introducing a generic deployment/release engine.

## Current Outcome
- Planning/log setup complete; RED integration test pending.

## Next Action
- Add failing integration test for worktree-to-main fast-forward integration.

## Implementation Update (2026-05-07) - bounded local-main integration helper

### Goal
- Add a bounded helper that integrates a merge-ready linked worktree branch into local `main` with FF-only safety and temp-path post-merge validation.

### Files Changed and Why
- `.pi/agent/extensions/execution-leases.ts`: added `LOCAL_MAIN_INTEGRATION_LEASE_SCOPE` and helper wrappers for one integration lease.
- `scripts/harness-sync-main.ts`: exported tracked-dirt/bookkeeping helpers so integration can reuse the same root cleanliness policy.
- `scripts/harness-integrate.ts`: added bounded integration helper with review-prep gating, integration lease, FF-only merge, generated-artifact tolerance, and temp-path validator outputs.
- `tests/integration/integrate-worktree.test.ts`: added fast-forward success, tracked-dirt block, non-FF block, and non-merge-ready source tests.
- `tests/extension-units/execution-leases.test.ts`: added local-main integration lease helper coverage.
- `package.json`: added `harness:integrate`, `harness:integrate:json`, and `test:integrate-worktree` aliases.
- `scripts/validate-core-workflows.sh`: added compile/copy/test/wiring coverage for the new helper.
- `README.md`, `.pi/agent/docs/operator_quickstart.md`, `.pi/agent/docs/operator_workflow.md`, `.pi/agent/docs/operator_manual.md`: documented bounded integration usage and temp-path validation behavior.

### RED Evidence
- Command: `node --experimental-loader "$LOADER" --import tsx --test .../tests/integration/integrate-worktree.test.ts`
- Failure: `ERR_MODULE_NOT_FOUND` for `scripts/harness-integrate.ts`, proving the new integration surface did not exist.

### GREEN Evidence
- Worktree-targeted tests via root dependency loader:
  - `node --experimental-loader "$LOADER" --import tsx --test .../tests/integration/integrate-worktree.test.ts`: 4 pass / 0 fail.
  - `node --experimental-loader "$LOADER" --import tsx --test .../tests/integration/sync-main.test.ts`: 2 pass / 0 fail.
  - `node --experimental-loader "$LOADER" --import tsx --test .../tests/extension-units/execution-leases.test.ts`: 6 pass / 0 fail.
- Validator:
  - `./scripts/validate-core-workflows.sh`: PASS.
- Static diff check:
  - `git diff --check`: PASS.

### Wiring Verification Evidence
- `harness:integrate` and `harness:integrate:json` route to `scripts/harness-integrate.ts`.
- The helper uses `buildHarnessWorktreeReviewPrep(...)` as the authoritative source-worktree seam instead of reimplementing merge-readiness rules.
- The helper reuses `readDirtyTrackedFiles(...)`, `isAllowedBookkeepingPath(...)`, and `listPreservedLocalBookkeeping(...)` from `harness-sync-main.ts` for root cleanliness policy.
- Post-merge validator outputs are passed via explicit `--report` and `--summary-json` temp paths.
- `validate-core-workflows.sh` compiles/copies the helper and runs `tests/integration/integrate-worktree.test.ts`.

### Behavior Changes and Risks
- The helper tolerates only narrow generated validation report artifacts under `reports/validation/*-validation-script.(md|json)`.
- Non-fast-forward source branches are blocked before merge.
- Dirty tracked root state is blocked.
- Post-merge validation failure leaves the merge in place but returns an error; rollback remains an explicit human/runtime decision.

### g-check Review (2026-05-07) - working-tree diff

#### Reviewed
- Repo: `/Users/subhajlimanond/dev/ma-code-worktrees/task-1778124392245-main-integration-helper`
- Branch: `split/task-1778124392245-main-integration-helper`
- Scope: working-tree diff for bounded local-main integration.
- Commands Run:
  - `git status --short`
  - `git diff --name-only`
  - `git diff --stat`
  - `git diff -- scripts/harness-integrate.ts scripts/harness-sync-main.ts .pi/agent/extensions/execution-leases.ts scripts/validate-core-workflows.sh`
  - `git diff --check`

#### Findings
CRITICAL
- none

HIGH
- none

MEDIUM
- none

LOW
- The helper does not attempt automatic rollback on post-merge validation failure. This is intentional for a first bounded slice, but future automation may want an opt-in rollback mode once semantics are fully specified.

#### Open Questions / Assumptions
- Assumption: one 30-minute integration lease is sufficient for the local FF-only merge plus one validator run.
- Assumption: only generated validation reports under `reports/validation/*-validation-script.(md|json)` should be tolerated automatically.

#### Recommended Tests / Validation
- Run the helper on root `main` against the live feature worktree branch, then rerun root acceptance checks.
- Keep validator reports on temp paths when integration is automatic.

#### Rollout Notes
- Additive rollout only; this is a bounded local-main integration tool, not a general deploy/release pipeline.
