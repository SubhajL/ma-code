# Operator Safety Rules

This is the operator-facing safety summary.
It complements `AGENTS.md`, `SYSTEM.md`, and runtime enforcement.

## Core rules
- do not mutate tracked files on `main`
- do not mutate without an active task
- do not bypass runtime safety controls
- do not disable tests/checks to force success
- do not claim completion without evidence

## Protected areas
Treat these as protected unless explicitly allowed:
- `.env*`
- `.git/`
- `node_modules/`
- `.pi/agent/state/runtime/`

## Human approval is still required for
- destructive git history changes
- force push
- large cleanup or rollback actions
- auth/secret/deployment-critical changes
- bypassing safety/task-discipline controls

## Bounded autonomy rule
The harness is queue-driven and bounded.
It is not permission to let the repo drift unattended.

## Scheduled workflow rule
Scheduled workflows are operator-visible and file-backed.
They do not imply a hidden daemon.
Use explicit materialization only when you want the queue job created.

## Validation rule
Prefer:
1. cheap/local proof first
2. one bounded live provider-backed proof only when needed

## If unsure
Block, pause, or escalate.
Do not improvise around uncertainty.
