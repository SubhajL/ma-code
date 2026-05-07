# Operator Quickstart

This is the shortest practical path for running the current harness as an operator-light system.
It assumes the queue/recovery/testing foundation already exists and focuses on the read-mostly UI, package scripts, and daily commands.

For the full operator documentation set, start at:
- `.pi/agent/docs/operator_manual.md`

## What this quickstart is
Current operator surface is intentionally lightweight:
- a read-only CLI status view
- a narrow lease inspection/stale-cleanup CLI
- an explicit worker-lane session CLI for lease-owned worktree lifecycle
- an explicit bounded queue-session CLI for multi-step queue advancement without a hidden daemon
- a file-backed scheduled workflow helper for explicit due-work inspection/materialization
- package-script entrypoints for common validators
- runtime queue control tools for live sessions

It is **not** a widget dashboard or background daemon.

## 1. Start from repo root
```bash
cd /Users/subhajlimanond/dev/ma-code
```

## 2. Install dev dependencies when needed
```bash
npm install --no-package-lock
```

## 3. Inspect current harness state quickly
Human-friendly text view:
```bash
npm run harness:status
```

Machine-readable JSON view:
```bash
npm run harness:status:json
```

This status surface summarizes:
- whether the queue is paused
- the active job and task
- job/task status counts
- blocked and failed items
- queue-session lease status
- recent job/task IDs

Inspect leases or clear only stale/expired leases:
```bash
npm run harness:leases
npm run harness:leases:json
npm run harness:leases -- clear-stale
```

`clear-stale` preserves active leases. Active lease force-clearing is intentionally not part of the normal Phase 3 operator path.

Run a bounded queue session when one-step queue advancement is too manual:
```bash
npm run harness:queue-session -- --scope "bounded queue operation" --max-steps 3
npm run harness:queue-session:json -- --scope "bounded queue operation" --max-steps 3 --max-runtime-seconds 30
```

This session helper:
- advances the queue only under explicit step/runtime limits
- stops once it reaches the next waiting point, idle state, pause, blocked state, or configured limit
- returns richer end-of-session triage data including action counts, touched job IDs, remaining queued work, and a recommended next action
- does not create a hidden recurring daemon

Inspect scheduled workflows separately:
```bash
npm run harness:schedules
npm run harness:schedules:json
```

Integrate a validated linked worktree branch into local main through the bounded helper:
```bash
npm run harness:integrate -- --worktree ../ma-code-worktrees/harness-024-worktree-helpers
npm run harness:integrate:json -- --worktree ../ma-code-worktrees/harness-024-worktree-helpers --skip-validation
```

This integration helper:
- requires a merge-ready linked worktree
- uses fast-forward-only merge semantics into local `main`
- tolerates only narrow generated validation artifacts in the root worktree
- writes post-merge validator reports to temp paths rather than repo-local report files by default

Use an explicit worker lane when a bounded build/review lane needs its own lease-owned worktree:
```bash
npm run harness:worker-session -- start --id HARNESS-064 --slug "worker lane"
npm run harness:worker-session -- status --scope harness-064
npm run harness:worker-session -- release --scope harness-064
npm run harness:worker-session -- release --scope harness-064 --cleanup
```

Worker sessions are not queue sessions: they do not auto-dispatch queued work or run a worker engine. Default release preserves the worktree; cleanup is opt-in and refuses dirty worktrees.

Check PR CI/security gates without `gh --watch`:
```bash
npm run harness:pr-gate -- --pr <number> --max-attempts 20
npm run harness:pr-gate:json -- --pr <number> --once
```

The PR gate helper polls once every 3 minutes by default, surfaces CI/security status plus review/comment triage, and stops on pass, failure, or the bounded attempt limit.

Materialize due workflows only through explicit operator action:
```bash
node --import tsx scripts/harness-scheduled-workflows.ts materialize --workflow repo-audit-run
node --import tsx scripts/harness-scheduled-workflows.ts materialize --workflow repo-audit-run --apply
```

## 4. Use package-script validator entrypoints
Common local validation commands:
```bash
npm run validate:extension-units
npm run validate:harness-routing
npm run validate:queue-runner
npm run validate:core-workflows
npm run validate:tuning-data
```

Focused integration proof for the operator/queue/schedule surfaces:
```bash
npm run test:operator-surface
npm run test:operator-leases
npm run test:queue-session
npm run test:scheduled-workflows
npm run test:integrate-worktree
npm run test:worker-session
```

## 5. Use live queue controls inside a harness session
When operating the queue in-session, use the runtime tools:
- `inspect_queue_state`
- `pause_queue`
- `resume_queue`
- `stop_queue_safely`
- `run_next_queue_job`
- `run_bounded_queue_session`

Recommended order:
1. inspect
2. pause/resume/stop if needed
3. use `run_next_queue_job` for one explicit step or `run_bounded_queue_session` for a bounded multi-step session
4. inspect again
5. review evidence before claiming completion

## 6. Keep the terminology accurate
Current implementation supports:
- bounded autonomy
- operator-light reviewable workflows
- queue/recovery/testing-backed operation

It does **not** support:
- endless unattended autonomy
- hidden background daemon scheduling
- rich widget UI

A safe summary is:
> operator-light harness for bounded queued work with visible control points

Next docs:
- `.pi/agent/docs/operator_workflow.md`
- `.pi/agent/docs/operator_install_guide.md`
- `.pi/agent/docs/operator_troubleshooting_guide.md`
