# MO Auto-Land Implementation Log

## 2026-05-10

### Goal
- Add explicit approved auto-land mode to Master Orchestrator run path.

### RED Evidence
- Added unit tests for approved auto-land and missing approval/lane blockers.
- Initial run failed because `OrchestratorRunRequest` had no auto-land support and worker_job still stopped at PR boundary.

### Changes
- `.pi/agent/extensions/orchestrator-run.ts`
  - Added `autoLand`, `syncMain`, and `mergeMethod` request fields.
  - Worker job uses `--no-stop-before-pr` only when auto-land has approval.
  - Added PR lifecycle chain: create, gate, merge-ready, merge, sync-main.
  - Auto-land blocks on missing approval, unsupported lane, failed gate, failed merge, or failed sync.
- `scripts/harness-orchestrate.ts`
  - Added CLI flags: `--auto-land`, `--sync-main`, `--merge-method`.
  - Kept approval required for merge-capable auto-land.
- Tests
  - Added unit and integration coverage for approved auto-land and blocking behavior.

### GREEN Evidence
- `TSX_IMPORT_PATH=/Users/subhajlimanond/dev/ma-code/node_modules/tsx/dist/loader.mjs node --import /Users/subhajlimanond/dev/ma-code/node_modules/tsx/dist/loader.mjs --test tests/extension-units/orchestrator-run.test.ts tests/integration/orchestrator-run.test.ts`
  - 11 tests passing.
- `git diff --check` passed.

### Known Gaps
- Auto-land is limited to single `worker_job` lane in this slice.
- Parallel multi-agent continuation still needs a scheduler policy that avoids overlapping file ownership before auto-landing multiple PRs.

### Cross-Model Check
- `second_model_plan` agreed with orchestrator-run placement and approval-gated PR lifecycle sequencing.
- It flagged that fake-runner tests are not enough for full production confidence; live/staging proof should be required before broad unattended use.

## Review

### CRITICAL
- none

### HIGH
- none

### MEDIUM
- none

### LOW
- none

### Review Notes
- Reviewed auto-land diff for approval gating, lane restriction, PR lifecycle sequencing, and default stop-before-PR preservation.
- Merge-capable path requires `--auto-land --approval-ref` and delegates through `harness:pr-lifecycle` rather than raw merge commands.

## Submission / PR Gate
- PR: https://github.com/SubhajL/ma-code/pull/128
- State: OPEN
- Checks: passing
- mergeStateStatus: CLEAN expected after GitHub refresh; merge helper verifies before apply.

## 2026-05-10 — Default approved auto-land policy

### Goal
- Enable “always auto-land after coding” for eligible MO worker-job runs.

### Discovery Path
- Auggie attempted and timed out; used local inspection of `orchestrator-run`, `harness-orchestrate`, and orchestrator tests.
- Direct implementation exemption: requested runtime policy change on existing MO auto-land surface.

### TDD Plan
- First tracer: worker-job run with no explicit `--auto-land` reads repo policy and delegates worker with approved PR creation, then PR lifecycle create/gate/merge-ready/merge/sync-main.
- Public interface: `runOrchestratorRun(...)` and `harness-orchestrate run`.
- Boundary fakes: temp repo policy file and fake PR lifecycle scripts; no live GitHub in tests.

### RED Evidence
- Command: `TSX_IMPORT_PATH=/Users/subhajlimanond/dev/ma-code/node_modules/tsx/dist/loader.mjs node --import /Users/subhajlimanond/dev/ma-code/node_modules/tsx/dist/loader.mjs --test tests/extension-units/orchestrator-run.test.ts`
- Failure: new default-policy tests failed because no policy loader/injection existed; expected auto-land completion but got conservative worker behavior / missing approval handling.

### Changes
- `.pi/agent/routing/orchestrator-auto-land-policy.json`
  - Added explicit repo policy enabling worker_job auto-land with approvalRef `user-approved-always-auto-land-2026-05-10`, sync-main, and squash merge.
- `.pi/agent/extensions/orchestrator-run.ts`
  - Loads repo-local auto-land policy.
  - Applies policy only to eligible `worker_job` runs.
  - Keeps approvalRef mandatory and blocks policy without one.
  - Supports `disableAutoLand` for explicit conservative runs.
- `scripts/harness-orchestrate.ts`
  - Added `--no-auto-land` CLI escape hatch.
  - Leaves `syncMain` undefined unless explicitly supplied so policy can provide the default.
- Tests
  - Added unit and integration coverage for default policy injection, explicit disable, and missing approvalRef blocking.

### GREEN Evidence
- Command run 3 consecutive times:
  - `TSX_IMPORT_PATH=/Users/subhajlimanond/dev/ma-code/node_modules/tsx/dist/loader.mjs node --import /Users/subhajlimanond/dev/ma-code/node_modules/tsx/dist/loader.mjs --test tests/extension-units/orchestrator-run.test.ts tests/integration/orchestrator-run.test.ts`
- Result: 16 tests passing on each run.
- `git diff --check` passed.

### Wiring Verification
- Non-test policy path is `.pi/agent/routing/orchestrator-auto-land-policy.json`.
- `runOrchestratorRun` reads the policy from repo root before building delegated worker command.
- Policy applies only after lane selection proves `worker_job`; queue-level and parallel lanes remain non-auto-land.
- `harness-orchestrate run --no-auto-land` disables the policy for a run.

### g-check Review

#### CRITICAL
- none

#### HIGH
- none

#### MEDIUM
- none

#### LOW
- none

#### Review Notes
- Checked for unsafe default broadening: policy is restricted to `worker_job`; unsupported lanes are not auto-landed.
- Checked approval bypass risk: enabled policy contains an explicit approvalRef and missing approvalRef blocks before delegation.
- Checked emergency escape hatch: `--no-auto-land` keeps conservative stop-before-PR behavior.

### Risks / Follow-ups
- Parallel/multi-agent default auto-land remains intentionally out of scope until a non-overlap scheduler exists.
- The approvalRef is a broad repo policy approval; rotate or disable the policy by editing `.pi/agent/routing/orchestrator-auto-land-policy.json` if operating mode changes.
