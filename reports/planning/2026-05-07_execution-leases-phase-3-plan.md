# Planning Log — execution-leases-phase-3

- Date: 2026-05-07
- Scope: Operator lease visibility and stale queue-session lease cleanup
- Status: ready
- Related coding log: `logs/coding/2026-05-07_execution-leases-phase-3.md`

## Goal
- Add additive queue-session lease visibility to queue inspection and operator status.
- Add a narrow operator lease CLI that lists leases and clears only stale/expired leases.

## Scope
- Extend `QueueInspectionSummary` with lease summary fields.
- Render queue lease status in `scripts/harness-operator-status.ts`.
- Add `scripts/harness-operator-leases.ts` with `list` and `clear-stale`, including `--json`.
- Add package aliases, docs, tests, and validator wiring.

## Files to Create or Edit
- `.pi/agent/extensions/queue-runner.ts`
- `.pi/agent/extensions/execution-leases.ts`
- `scripts/harness-operator-status.ts`
- `scripts/harness-operator-leases.ts`
- `tests/integration/operator-surface.test.ts`
- `tests/integration/operator-leases.test.ts`
- `package.json`
- `scripts/validate-core-workflows.sh`
- `README.md`
- `.pi/agent/docs/operator_quickstart.md`
- `.pi/agent/docs/operator_workflow.md`
- `.pi/agent/docs/operator_manual.md`
- `logs/CURRENT.md`

## Why Each File Exists
- Lease helper owns stale/expired classification and stale-only cleanup.
- Queue-runner owns `inspect_queue_state` summary shape.
- Status CLI renders existing inspection output.
- Lease CLI gives explicit bounded operator action for stale cleanup.
- Tests prove additive JSON/text status and stale-only safety.
- Validator script proves isolated runtime compile/test wiring.
- Docs describe safe operator usage.

## What Logic Belongs There
- Stale detection and prune/write helpers belong in `execution-leases.ts`.
- Queue-session-specific summary shaping belongs in `queue-runner.ts`.
- Text/JSON CLI rendering belongs in scripts.

## What Should Not Go There
- No active lease force-clear path.
- No heartbeat or renewal design changes.
- No queue/session behavior changes beyond inspection visibility.
- No unified operator wrapper or worktree worker lanes.

## Dependencies
- Phase 1 `leases.json` helper state.
- Phase 2 `QUEUE_SESSION_LEASE_SCOPE` and queue-session enforcement.
- Existing operator status CLI and core workflow validator.

## Acceptance Criteria
- `inspect_queue_state` includes additive lease fields under `summary`.
- Status text and JSON expose queue-session lease visibility without reshaping top-level JSON.
- `harness:leases` and `harness:leases:json` list lease state.
- `clear-stale` removes expired leases only and preserves active leases.
- Docs state stale cleanup boundary and avoid active force-clear guidance.

## Likely Failure Modes
- Active lease accidentally removed by cleanup.
- Status JSON shape changed incompatibly.
- Validator temp runtime misses the new lease script/test.
- Docs imply operators should force-clear active leases.

## Validation Plan
- RED: `node --import tsx --test tests/integration/operator-surface.test.ts` after adding lease assertions.
- GREEN:
  - `node --import tsx --test tests/integration/operator-surface.test.ts`
  - `node --import tsx --test tests/integration/operator-leases.test.ts`
  - `./scripts/validate-core-workflows.sh`
- Optional command checks:
  - `npm run harness:status -- --cwd <temp>`
  - `npm run harness:leases -- --cwd <temp>`

## Recommended Next Step
- Add failing operator-surface lease summary assertions, then implement the smallest queue inspection/status changes.
