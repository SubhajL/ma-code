# Operator Quickstart

This is the shortest practical path for running the current harness as an operator-light system.
It assumes the queue/recovery/testing foundation already exists and focuses on the read-mostly UI, package scripts, and daily commands.

## What this quickstart is
Current operator surface is intentionally lightweight:
- a read-only CLI status view
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

## 4. Use package-script validator entrypoints
Common local validation commands:
```bash
npm run validate:extension-units
npm run validate:harness-routing
npm run validate:queue-runner
npm run validate:core-workflows
npm run validate:tuning-data
```

Focused integration proof for the operator surface:
```bash
npm run test:operator-surface
```

## 5. Use live queue controls inside a harness session
When operating the queue in-session, use the runtime tools:
- `inspect_queue_state`
- `pause_queue`
- `resume_queue`
- `stop_queue_safely`
- `run_next_queue_job`

Recommended order:
1. inspect
2. pause/resume/stop if needed
3. run at most one bounded queue step
4. inspect again
5. review evidence before claiming completion

## 6. Keep the terminology accurate
Current implementation supports:
- bounded autonomy
- operator-light reviewable workflows
- queue/recovery/testing-backed operation

It does **not** support:
- endless unattended autonomy
- background daemon scheduling
- rich widget UI

A safe summary is:
> operator-light harness for bounded queued work with visible control points
