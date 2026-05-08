# Slice Dependency Decision

Phase 10 adds a conservative, pure decision surface for future cross-slice parallelism.

## Purpose

`decideSliceParallelism(input)` answers one question: do two or more slice summaries contain enough proof to be treated as a parallel candidate?

It is intentionally not a scheduler. Phase 10 does not dispatch work, does not create task packets, does not create queue jobs, does not acquire leases, does not create worker sessions, and does not mutate runtime state.

## Command

```bash
npm run harness:slice-dependencies -- --check <slice-summary.json> <slice-summary.json> --json
npm run validate:slice-dependencies
```

The CLI reads artifact paths and prints the structured decision. It writes no files.

## Decision shape

Machine-readable schema:

- `.pi/agent/state/schemas/slice-dependency-decision.schema.json`

Core output fields:

- `parallelAllowed`: true only when there are no blockers
- `decision`: `blocked` or `allowed`
- `blockers`: structured blocker type, slice IDs, paths, and reason
- `proof`: booleans for every required independence claim
- `recommendedExecution`: `sequential` or `parallel_candidate`

## Conservative proof requirements

The helper blocks when any required proof is missing or shared:

- same `sliceId`
- missing slice artifact or malformed artifact
- missing `filesToModify` proof
- missing `allowedPaths` proof
- shared or overlapping `filesToModify`
- overlapping mutating `allowedPaths`
- shared contract path or contract hash
- shared schema or migration paths
- shared config paths
- shared tests or fixture paths
- unknown lease/worktree conflict state when scheduling readiness is requested

Read-only or explicitly non-mutating `allowedPaths` overlaps do not block by themselves.

## Phase 10 boundary

- This phase creates the dependency decision surface only.
- It performs no queue, lease, task, worker-session, or filesystem mutation.
- It does not change queue-runner behavior.
- It does not schedule cross-slice parallel work.
- Later Phase 11 scheduler work must call this helper before any cross-slice parallel dispatch and must add its own lease/worktree conflict evidence.
- Intra-slice phases remain sequential; same-slice phase parallelism is still forbidden.

## Recommended input summary

```json
{
  "sliceId": "slice-001",
  "filesToModify": ["app/checkout/page.tsx"],
  "allowedPaths": ["app/checkout"],
  "contracts": [
    {
      "path": "docs/initiatives/demo/contracts/slice-001.contract.json",
      "hash": "sha256..."
    }
  ],
  "schemaPaths": [],
  "migrationPaths": [],
  "configPaths": [],
  "testPaths": [],
  "fixturePaths": []
}
```

## Migration path

- Phase 10: add pure helper, schema, CLI, validator, docs, and tests.
- Phase 11: scheduler may consume this helper before cross-slice parallel dispatch.
- Future sharing policy may allow known-safe shared tests or fixtures; until then, shared proof blocks by default.
