# Planning Log — execution-leases-phase-4

- Date: 2026-05-07
- Scope: Explicit worker-lane lifecycle over leases and worktrees
- Status: ready
- Related coding log: `logs/coding/2026-05-07_execution-leases-phase-4.md`

## Goal
- Add an explicit worker-lane lifecycle without auto-dispatch.
- Compose existing lease state and worktree mechanics instead of adding a second runtime registry.

## Scope
- Add worker-lane lease metadata helpers.
- Add `scripts/harness-worker-session.ts` with `start`, `status`, and `release`.
- Keep cleanup opt-in and conservative.
- Add package aliases, docs, tests, and validator wiring.

## Files to Create or Edit
- `.pi/agent/extensions/execution-leases.ts`
- `tests/extension-units/execution-leases.test.ts`
- `scripts/harness-worker-session.ts`
- `tests/integration/worker-session.test.ts`
- `package.json`
- `scripts/validate-core-workflows.sh`
- `README.md`
- `.pi/agent/docs/operator_quickstart.md`
- `.pi/agent/docs/operator_workflow.md`
- `.pi/agent/docs/operator_manual.md`
- `logs/CURRENT.md`

## Why Each File Exists
- Lease helper owns authoritative worker-lane ownership and metadata normalization.
- Worker-session script composes lease and worktree helpers.
- Worktree helper remains generic and authoritative for git mechanics.
- Tests prove lifecycle behavior through public CLI functions and real git worktrees.
- Validator/docs/package wiring expose the new operator surface.

## What Logic Belongs There
- Worker-lane lease acquire/find/release logic belongs in `execution-leases.ts`.
- Lifecycle orchestration belongs in `harness-worker-session.ts`.
- Git worktree mechanics remain in `harness-worktree.ts`.

## What Should Not Go There
- No automatic queue-to-worktree dispatch.
- No generalized worker execution engine.
- No implicit worktree cleanup.
- No forceful dirty cleanup.

## Dependencies
- Phase 1-3 lease helper state and stale cleanup support.
- Existing harness worktree helper exports: create, inspect, cleanup, branch/path builders.

## Acceptance Criteria
- `start` creates a bounded worktree and records a worker-lane lease with path/branch metadata.
- `status` reports the authoritative lease plus worktree cleanliness.
- `release` clears the lease and preserves the worktree by default.
- `release --cleanup` removes clean worktrees and refuses dirty worktrees.
- Existing worktree helper tests still pass.

## Likely Failure Modes
- Worktree created but lease acquisition fails.
- Lease acquired but cleanup is implicit/destructive.
- Worker-session duplicates worktree mechanics instead of composing helper exports.
- Dirty cleanup removes data.

## Validation Plan
- RED: `node --import tsx --test tests/integration/worker-session.test.ts` before script exists.
- GREEN:
  - `node --import tsx --test tests/integration/worker-session.test.ts`
  - `node --import tsx --test tests/integration/worktree-helper.test.ts`
  - `node --import tsx --test tests/extension-units/execution-leases.test.ts`
  - `./scripts/validate-core-workflows.sh`

## Recommended Next Step
- Add failing worker-session tracer test, then implement the smallest start path.
