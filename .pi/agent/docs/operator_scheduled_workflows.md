# Scheduled Workflow Operating Guide

This guide explains how to operate the current HARNESS-033 scheduled workflow surface.

## Source of truth
- config: `.pi/agent/schedules/scheduled-workflows.json`
- helper: `scripts/harness-scheduled-workflows.ts`
- runtime state: `.pi/agent/state/runtime/scheduled-workflows.json`

## Supported schedule types
- `daily`
- `weekday`
- `manual-disabled`

## Current recurring workflows
- `daily-review-queue`
- `repo-audit-run`
- `backlog-summarization`
- `test-triage`
- `docs-safe-cleanup` (manual-disabled)

## Inspect first
Read-only status:
```bash
npm run harness:schedules
npm run harness:schedules:json
```

Dry-run one workflow:
```bash
node --import tsx scripts/harness-scheduled-workflows.ts materialize --workflow repo-audit-run
```

## Apply only explicitly
Actually create queue jobs only when you intend to:
```bash
node --import tsx scripts/harness-scheduled-workflows.ts materialize --workflow repo-audit-run --apply
```

## Expected behavior
- due workflows can be inspected without queue mutation
- manual-disabled workflows stay disabled until intentionally handled
- duplicate same-run materialization is blocked visibly
- no hidden recurring daemon loop exists

## Operator cautions
- do not treat due status as automatic approval
- do not assume a due workflow already exists in the queue
- keep docs cleanup narrow and approval-aware
- if a scheduled workflow would widen scope, do not apply it blindly

## Validation
Useful proof:
```bash
npm run test:scheduled-workflows
npm run validate:core-workflows
```
