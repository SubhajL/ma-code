# Operator Extension Guide

This guide explains the main runtime/helper surfaces from an operator point of view.

## Runtime enforcement extensions
### `safe-bash.ts`
Purpose:
- block unsafe shell behavior
- block tracked-file mutation on `main`
- protect protected paths
- enforce worktree-aware mutation safety

### `till-done.ts`
Purpose:
- task discipline
- review/validation-before-done rules
- evidence recording expectations

### `queue-runner.ts`
Purpose:
- inspect queue state
- pause/resume/stop safely
- run one bounded queue step
- finalize running jobs based on linked task state
- enforce supported stop conditions

## Deterministic orchestration helpers
### `harness-routing.ts`
- resolves role -> provider/model/thinking decisions

### `team-activation.ts`
- resolves which team should activate for bounded work

### `task-packets.ts`
- generates bounded worker-scoped task packets

### `handoffs.ts`
- generates structured handoffs between roles/teams

### `recovery-policy.ts`
- classifies failure types and retry eligibility

### `recovery-runtime.ts`
- recommends retry/rollback/stop actions from runtime evidence

## Operator-facing helper CLIs
### `scripts/harness-operator-status.ts`
- read-only queue/task snapshot

### `scripts/harness-scheduled-workflows.ts`
- due workflow inspection
- explicit queue materialization

### `scripts/harness-worktree.ts`
- branch/worktree helper surface

### `scripts/harness-package.ts`
- package manifest inspection
- bootstrap/install scaffolding for another repo

## Validation scripts operators should know
- `scripts/validate-phase-a-b.sh`
- `scripts/validate-harness-routing.sh`
- `scripts/validate-queue-runner.sh`
- `scripts/validate-core-workflows.sh`
- `scripts/validate-harness-package.sh`
- `scripts/collect-harness-tuning-data.sh`
