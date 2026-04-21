# Planning Log — harness-032-one-job-runner

- Date: 2026-04-21
- Scope: Implement HARNESS-032 as a bounded single-runner queue runner that advances at most one queue job per call.
- Status: completed
- Related coding log: `logs/coding/2026-04-21_harness-032-one-job-runner.md`

## Discovery Path
- Read required skills first:
  - `.pi/agent/skills/backend-safety/SKILL.md`
  - `.pi/agent/skills/validation-checklist/SKILL.md`
- Local discovery used after Auggie fallback reported unavailable credits.
- Key files inspected:
  - `.pi/agent/extensions/till-done.ts`
  - `.pi/agent/extensions/harness-routing.ts`
  - `.pi/agent/extensions/team-activation.ts`
  - `.pi/agent/extensions/task-packets.ts`
  - `.pi/agent/extensions/handoffs.ts`
  - `.pi/agent/extensions/recovery-runtime.ts`
  - `.pi/agent/docs/queue_semantics.md`
  - `.pi/agent/state/schemas/queue.schema.json`
  - validation scripts under `scripts/validate-*.sh`

## Goal
Add one bounded queue-runner tool that:
- finalizes one existing `running` queue job from linked task state when that task is terminal
- otherwise starts one eligible queued job
- keeps single-runner semantics explicit and reviewable

## Non-Goals
- no free-running daemon loop
- no scheduled workflows
- no parallel queue execution
- no broad queue UI or control plane
- no redesign of routing/team/packet/handoff/recovery semantics

## Design Notes
- Reuse executable helper surfaces instead of inventing queue-local copies.
- Extract only minimal reusable `till-done` helpers needed to preserve task lifecycle semantics.
- Keep queue state versioned and additive by using optional executable linkage fields.
- Prefer blocking invalid queued jobs over guessing missing acceptance or packet boundaries.

## Planned Changes
- Add `.pi/agent/extensions/queue-runner.ts` with public tool `run_next_queue_job` (`run_queue_once` only as a compatibility alias if needed).
- Export minimal reusable task-state/task-update helpers from `till-done.ts`.
- Extend queue schema/docs with executable linkage fields used by the bounded runner.
- Add `tests/extension-units/queue-runner.test.ts`.
- Add `scripts/validate-queue-runner.sh`.
- Update compile/static/CI/doc wiring and active log pointers.

## Validation Plan
- `./scripts/check-foundation-extension-compile.sh`
- `./scripts/check-repo-static.sh`
- `./scripts/validate-extension-unit-tests.sh`
- `./scripts/validate-queue-runner.sh`
- `./scripts/validate-queue-semantics.sh`
- `./scripts/validate-phase-a-b.sh`
- `git diff --check`

## Risks
- queue/task state are separate files, so queue-start and task-start are not a single cross-file transaction
- current runner advances one step only; operator or a future scheduler must call it repeatedly
- queue jobs still need bounded packet inputs (`domains` or `allowedPaths`) to start safely

## HARNESS-032 Fixup Note — 2026-04-21
- Keep the queue-runner surface bounded and rename the public tool contract to `run_next_queue_job`, retaining `run_queue_once` only as a compatibility alias.
- Tighten the start path by preparing/claiming the linked task first and starting it last so queue activation can compensate cleanly instead of leaving an orphan `in_progress` task.
- Treat concrete queue-job `budget` fields and non-empty `stop_conditions` as explicit blockers until HARNESS-034 adds runtime enforcement.
- Add tests for empty/paused queues, active non-terminal jobs, blocked-task finalization, deterministic same-priority ordering, and start-path compensation.

## HARNESS-032 Follow-up Note — 2026-04-21
- Keep `.pi/agent/state/runtime/tasks.json` and `logs/harness-actions.jsonl` out of the committed change set.
- Basis: existing repo guidance already says runtime state and audit-log tracked artifacts should stay out of PR diffs.
- Safe cleanup path for this slice: restore both files to branch `HEAD` after task bookkeeping so the PR stays focused on code/docs artifacts.

## HARNESS-032 Final Cleanup Note — 2026-04-21
- Keep the coordination fix bounded to `queue-runner.ts`: one local shared lock coordinates queue+task state reads/writes for the practical start/finalize/repair paths instead of introducing a broader state subsystem.
- Keep queue schema linkage minimal: retain fields needed for bounded task/packet start, handoff IDs, recovery notes, and observability, but drop unused packet override fields from queue jobs.
- Make operator validation slightly stronger by default: queue-runner validator should attempt one bounded live probe when possible, while CI/static runs opt out explicitly with `--skip-live`.
- Add the smallest repo-root Node metadata needed for direct extension-test entry points, but do not widen into app tooling.
- Record the remaining environment caveat explicitly: direct repo-root npm-script proof may still depend on local dependency installation, and runtime safety may block that install in some sessions.
