# Parallel Worker Lanes

Phase 12 adds a bounded foreground helper for running different whole product slices in parallel worker lanes. It is additive to the queue runner and product pipeline; it does not replace queue semantics and it does not introduce a daemon.

## Operator Surface

Use the dedicated helper or the operator front door:

```bash
npm run harness:parallel-worker-lanes -- dry-run --initiative <slug> --max-parallel 2
npm run harness:parallel-worker-lanes -- apply --initiative <slug> --max-parallel 2
npm run harness:parallel-worker-lanes -- run --initiative <slug> --max-parallel 2 --max-runtime-seconds 300 --worker-command '<explicit command>'
npm run harness:parallel-worker-lanes -- status --initiative <slug>
npm run harness:parallel-worker-lanes -- cleanup --initiative <slug> --lane-id <lane-id>

npm run harness:operator -- parallel-worker-lanes dry-run --initiative <slug>
```

## Runtime Model

- `dry-run` reads the product pipeline plan, Phase 10 parallel decisions, packet references, and active leases; it writes no files.
- `apply` acquires a top-level orchestration lease, starts bounded worker sessions/worktrees for eligible lanes, and writes one durable manifest under `docs/initiatives/<slug>/pipeline-runs/<run-id>.parallel-lanes.json`.
- `run` is foreground and bounded by `--max-runtime-seconds` and `--max-parallel`; it uses an explicit operator-provided command and does not perform live provider-backed execution unless the operator supplies that command.
- `status` reads the latest durable manifest and reports lane state, leases, worktrees, blockers, and next action.
- `cleanup` is explicit; it uses the worker-session cleanup path and refuses dirty linked worktrees.

## Safety Rules

- No daemon: every action is an explicit foreground command.
- Same-slice phases are sequential. Parallelism is only across different whole slices.
- Cross-slice parallelism requires Phase 10 `parallelAllowed: true` proof for every active pair.
- Missing Phase 10 proof, negative Phase 10 decisions, HITL gates, missing packet artifacts, failed slices, dirty/protected repo state, and worker-lane lease conflicts block `apply`.
- Failed lane worktrees are preserved for inspection with `cleanupPolicy: preserve_on_failure`.
- Successful cleanup must be requested explicitly and refuses dirty worktrees.
- Operators must not edit `.pi/agent/state/runtime/*.json` directly; leases are managed through the execution lease and worker-session helpers.

## Manifest

Manifests are durable initiative artifacts, not raw runtime state:

```text
docs/initiatives/<slug>/pipeline-runs/<run-id>.parallel-lanes.json
```

The manifest records:

- initiative and run identifiers
- max parallel slice decision
- orchestration lease id
- lane id, slice id, phase, packet path, worker-session scope, branch, worktree, and status
- Phase 10 proof summary
- blockers and last action

## Relationship to Product Pipeline

The product pipeline remains the source of slice DAG/status artifacts. Parallel worker lanes consume the Phase 11 pipeline plan and Phase 10 `parallelAllowed` decisions, then materialize worker-session/worktree lanes without changing queue-runner semantics.
