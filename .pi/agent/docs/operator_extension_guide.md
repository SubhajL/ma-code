# Operator Extension Guide

This guide explains the main runtime/helper surfaces from an operator point of view.

## Runtime control extensions
Two flavors live here. **Hard enforcement** (lease conflicts, completion gates, protected-path writes via the typed `write` tool, dirty-repo blockers) genuinely cannot be bypassed at runtime. **Guardrails** (the `safe-bash` regex layer) catch common-shape mistakes but are not sandboxes and can be bypassed by `bash -c`, `eval`, command substitution, etc. Both are useful; conflating them is not.

### `safe-bash.ts` — guardrail, not sandbox
Purpose:
- catch common-shape destructive shell patterns by regex (`rm -rf`, `git reset --hard`, force push, recursive chown, etc.)
- block tracked-file mutation on `main`
- protect protected paths against pattern-detectable writes
- enforce worktree-aware mutation safety for the patterns it matches

Limits:
- regex-only — bypassable via `bash -c '...'`, `eval`, base64-piped-to-`sh`, command substitution, shell aliases, and similar shell features
- does not constrain subprocesses spawned by an allowed command
- treat it as a tripwire complementing task discipline and audit logging, not as a security boundary

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
