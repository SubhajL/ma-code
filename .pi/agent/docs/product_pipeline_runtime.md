# Product Pipeline Runtime

Phase 11 adds an additive product pipeline runtime surface that turns existing initiative artifacts into an operator-visible execution plan. It is intentionally bounded and foreground-only.

## Public commands

```bash
npm run harness:product-pipeline -- dry-run --initiative <slug>
npm run harness:product-pipeline -- dry-run --initiative <slug> --json
npm run harness:product-pipeline -- apply --initiative <slug> --max-parallel 1
npm run harness:product-pipeline -- status --initiative <slug>
npm run harness:operator -- product-pipeline dry-run --initiative <slug>
npm run harness:parallel-worker-lanes -- dry-run --initiative <slug> --max-parallel 2
```

## Durable files

- Initiative plan: `docs/initiatives/<slug>/pipeline.json`
- Run artifacts: `docs/initiatives/<slug>/pipeline-runs/<run-id>.json`
- Parallel lane manifests: `docs/initiatives/<slug>/pipeline-runs/<run-id>.parallel-lanes.json`
- Schema: `.pi/agent/state/schemas/product-pipeline.schema.json`
- Parallel lane schema: `.pi/agent/state/schemas/parallel-worker-lanes.schema.json`

The product pipeline never directly edits `.pi/agent/state/runtime/*.json`. Runtime task/queue state remains controlled by existing runtime helpers.

## Runtime behavior

### dry-run

- loads initiative artifacts from `docs/initiatives/<slug>/pipeline.json`
- builds the slice DAG
- shows HITL gates
- shows the required sequential phase order inside each slice
- shows Phase 10 parallel decisions or conservative missing-proof blockers
- dry-run writes no files

### apply

- checks repository cleanliness before mutating when the target is a Git worktree
- stops at unresolved HITL gates
- materializes only ready work into the durable pipeline run artifact
- respects `--max-parallel`
- refuses cross-slice parallelism without explicit `parallelAllowed: true` proof
- apply performs one bounded foreground materialization step, then exits
- no daemon, no watcher, no unbounded loop, and no hidden queue dispatch

### status

- reads the latest durable run artifact when present
- otherwise computes a read-only plan snapshot
- reports status, blocked slices, active lanes, materialized preview work, and the next operator action

## Parallelism rules

- Intra-slice phases remain sequential.
- Same-slice phase parallelism is impossible because a slice has one `currentPhase` and one required `phaseOrder`.
- Cross-slice parallelism requires Phase 10 `parallelAllowed: true` proof for every active pair.
- Missing Phase 10 proof is treated as blocked, not inferred as safe.

## HITL gate rules

- HITL gates block apply until their `status` is `approved` or `resolved`.
- Common gates include screen approval, architecture approval, auth/secrets approval, and deployment judgment.
- Rejected or waiting gates remain visible in `blockedSlices` and `nextOperatorAction`.

## Materialization boundary

This phase materializes previews only:

- `materializedWork.queueJobIds` uses deterministic `preview:<initiative>:<slice>:<phase>` IDs.
- `materializedWork.workerSessionIds` remains empty.
- `materializedWork.worktreePaths` remains empty.
- No queue jobs, worker sessions, handoffs, product code, or runtime JSON are created by this helper.

Phase 12 worker-session materialization is delegated to `.pi/agent/docs/parallel_worker_lanes.md`. It continues to use existing worker-session/worktree and execution-lease helpers rather than raw JSON edits. It is foreground-only, has no daemon, preserves failed worktrees, keeps same-slice phases sequential, and requires Phase 10 `parallelAllowed: true` proof for every cross-slice lane pair.

## Validation

```bash
node --import tsx --test tests/extension-units/product-pipeline.test.ts
node --import tsx --test tests/integration/product-pipeline.test.ts
./scripts/validate-product-pipeline.sh
./scripts/validate-parallel-worker-lanes.sh
```
