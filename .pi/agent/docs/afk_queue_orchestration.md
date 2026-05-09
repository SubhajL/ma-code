# AFK Queue Orchestration (Phase B)

Phase B converts durable Phase A issue artifacts into queue-ready AFK jobs. It is a bounded foreground operator helper, not a daemon and not automatic coding.

## Commands

```bash
npm run harness:afk-orchestrate -- dry-run --initiative greenfield-scaffold --max-parallel 1
npm run harness:afk-orchestrate -- apply --queue-only --initiative greenfield-scaffold
npm run harness:afk-orchestrate -- run --run --initiative greenfield-scaffold --max-steps 1 --max-runtime-seconds 30 --max-parallel 1
npm run harness:afk-orchestrate -- status --initiative greenfield-scaffold
npm run harness:afk-orchestrate -- dry-run --initiative greenfield-scaffold --explain issue-002
```

## Inputs

Phase B reads the Phase A artifacts under `docs/initiatives/<slug>/`:

- `issues.json`
- `slice-plan.json`
- `pipeline.json`
- `slices/<issue-id>.summary.json`

## Eligibility rules

An issue can be automatically queue-materialized only when all of these are true:

- issue type is `AFK`
- all dependencies have status `done` or `approved`
- no HITL gate is present
- `approvalRequired` is not true
- `acceptanceCriteria` is present
- `validationProof` is present
- `domains` contains a valid harness domain
- `allowedPaths` is present
- per-slice summary artifact exists

HITL issues are never queued automatically. Issues with unresolved dependencies are deferred. Missing safety proof blocks materialization.

## Queue materialization boundary

`apply --queue-only` creates queue jobs through the queue-runner `materializeQueueJobs` helper path and writes a durable run artifact under:

- `docs/initiatives/<slug>/afk-runs/<run-id>.json`

Generated queue jobs include `queueJobSource: issue-materialization` provenance and `approvalRequired: false`.

Phase B does not create product-code commits, does not call worker engines directly, does not create a daemon, and does not directly edit `.pi/agent/state/runtime/*.json` outside the queue-runner helper path.

## Run mode

`run --run` requires explicit `--max-steps`, `--max-runtime-seconds`, and `--max-parallel`. It materializes eligible jobs and delegates to the existing bounded queue session. It stops visibly through queue runner stop reasons such as idle, blocked, waiting on active task, max steps, or max runtime.

## Parallel safety

`--max-parallel` defaults to `1`. With `--max-parallel > 1`, disjoint eligible issue pairs are marked `parallel_candidate`. Shared files or overlapping allowed path roots are forced sequential. Intra-worker implementation remains controlled by the existing queue/session runtime.
