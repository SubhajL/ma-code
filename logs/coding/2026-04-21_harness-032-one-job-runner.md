# Coding Log — harness-032-one-job-runner

- Date: 2026-04-21
- Scope: Implement HARNESS-032 as a bounded single-runner queue runner.
- Status: completed
- Branch: `feat/harness-032-one-job-runner`
- Related planning log: `reports/planning/2026-04-21_harness-032-one-job-runner-plan.md`

## What Changed
- Added bounded queue-runner extension:
  - `.pi/agent/extensions/queue-runner.ts`
  - public tool: `run_next_queue_job`
  - compatibility alias: `run_queue_once`
- Added minimal reusable `till-done` helper exports so queue execution can reuse task lifecycle logic instead of duplicating it.
- Extended queue schema/docs with executable queue-runner fields such as:
  - `acceptanceCriteria`
  - `taskClass`
  - `workType`
  - `domains`
  - `allowedPaths`
  - `assignedRole`
  - `linkedTaskId`
  - `packetId`
  - `selectedModelId`
  - `initialHandoffId`
  - `startedAt` / `finishedAt` / `updatedAt`
  - recovery summary fields
- Added targeted queue-runner tests and validator:
  - `tests/extension-units/queue-runner.test.ts`
  - `scripts/validate-queue-runner.sh`
- Updated compile/static/CI/doc wiring so queue-runner and queue-semantics validation remain discoverable.

## Behavioral Notes
- `run_next_queue_job` follows a start/finalize model (`run_queue_once` remains a compatibility alias):
  - if one queue job is already `running`, it only finalizes that job when the linked task reaches `done`, `blocked`, or `failed`
  - otherwise it starts at most one eligible queued job
- Starting a queued job reuses existing executable surfaces for:
  - team activation
  - task packet generation
  - optional initial build handoff generation
  - task lifecycle start semantics from `till-done`
- Finalizing a failed or blocked linked task reuses recovery-runtime decision logic.
- Jobs without explicit `acceptanceCriteria` are blocked rather than guessed.
- Jobs missing bounded packet inputs are also blocked because the runner cannot safely generate a packet.

## Validation Evidence
- `./scripts/check-foundation-extension-compile.sh` → `foundation-extension-compile-ok`
- `./scripts/check-repo-static.sh` → `repo-static-checks-ok`
- `./scripts/validate-extension-unit-tests.sh` → `Extension unit-test validation PASS`
- `./scripts/validate-queue-runner.sh` → `Queue-runner validation PASS`
- `./scripts/validate-queue-semantics.sh` → `Queue-semantics validation PASS`
- `./scripts/validate-phase-a-b.sh` → completed successfully with PASS checks through cleanup/runtime reset
- `git diff --check` → no output

## Known Gaps
- queue start/finalize is still a one-step tool call, not a daemon or scheduler
- queue state and task state are not updated transactionally across both files
- future operator controls such as pause/resume UI, scheduled workflows, and richer stop counters remain later work

## HARNESS-032 Fixup Note — 2026-04-21
- Public queue-runner contract now prefers `run_next_queue_job`; `run_queue_once` remains only as a compatibility alias.
- Queue start now prepares/claims a linked task, generates packet/handoff data, marks the queue running, then starts the task last with bounded compensation that clears `activeJobId` and blocks the queue job if the final task start fails.
- HARNESS-032 now blocks queued jobs that declare concrete `budget` fields or non-empty `stop_conditions` until HARNESS-034 adds real enforcement.
- Queue-runner unit coverage was expanded for empty/paused no-ops, active non-terminal jobs, blocked-task finalization, deterministic selection, and start-path compensation.

## HARNESS-032 Follow-up Note — 2026-04-21
- This docs/cleanup follow-up keeps `.pi/agent/state/runtime/tasks.json` and `logs/harness-actions.jsonl` out of the committed change set.
- Basis: earlier repo guidance already recorded that runtime state and audit-log tracked artifacts should not ship in the PR diff.
- Implementation path: restore both files to branch `HEAD` after task bookkeeping so the final diff stays limited to intended code/docs artifacts.

## HARNESS-032 Final Cleanup Note — 2026-04-21
- Reduced queue/task coordination risk in `queue-runner.ts` by adding a queue-runner-local shared coordination lock around practical multi-file queue+task mutations for start/finalize/repair paths.
- Trimmed queue job pass-through packet override fields back to the minimal bounded linkage set; queue start now relies on task-packet policy defaults for discovery/disallowed/evidence/validation/wiring/escalation fields.
- `scripts/validate-queue-runner.sh` now attempts one bounded live probe by default when possible, supports explicit `--skip-live`, and CI now calls it with `--skip-live`.
- Added a minimal root `package.json` + `node_modules/` ignore entry for direct repo-root extension test ergonomics.
- Validation reran successfully for queue-runner, queue semantics, extension unit tests, foundation compile, repo static checks, and `git diff --check`.
- Direct repo-root execution proof remains partially blocked in this environment: `npm install --no-package-lock --silent` was blocked by runtime safety, and `npm exec` temporary-package fallbacks did not satisfy repo-local module resolution for the new npm script path.
