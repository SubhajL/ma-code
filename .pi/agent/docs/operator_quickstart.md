# Operator Quickstart

This is the shortest practical path for running the current harness as an operator-light system.
It assumes the queue/recovery/testing foundation already exists and focuses on the read-mostly UI, package scripts, and daily commands.

For the full operator documentation set, start at:
- `.pi/agent/docs/operator_manual.md`

## What this quickstart is
Current operator surface is intentionally lightweight:
- a read-only CLI status view
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
- recent job/task IDs

Run a bounded queue session when one-step queue advancement is too manual:
```bash
npm run harness:queue-session -- --max-steps 3
npm run harness:queue-session:json -- --max-steps 3 --max-runtime-seconds 30
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
npm run test:queue-session
npm run test:scheduled-workflows
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
