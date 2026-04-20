# Planning Log — harness-030-031-recovery-decision

- Date: 2026-04-20
- Scope: Implement HARNESS-030 and HARNESS-031 as one bounded runtime recovery-decision surface that recommends retry, rollback, stop, or escalation using existing validation/failure evidence.
- Status: ready
- Related coding log: `logs/coding/2026-04-20_harness-030-031-recovery-decision.md`

## Goal
- Add one executable recovery decision tool before queue work so HARNESS-032 does not become a blind retry loop.

## Scope
- Create a deterministic recovery-decision extension.
- Reuse task/validation/failure evidence already recorded by runtime flows.
- Add a focused validator script and wire it into CI/static checks.
- Update minimal docs/status pointers for the new executable surface.

## Files to Create or Edit
- `.pi/agent/extensions/recovery-decision.ts`
- `.pi/agent/docs/validation_recovery_architecture.md`
- `.pi/agent/docs/team_orchestration_architecture.md`
- `.pi/agent/docs/file_map.md`
- `README.md`
- `scripts/validate-recovery-decision.sh`
- `scripts/check-repo-static.sh`
- `.github/workflows/ci.yml`
- `logs/CURRENT.md`
- `logs/coding/2026-04-20_harness-030-031-recovery-decision.md`

## Why Each File Exists
- `recovery-decision.ts`: executable retry/rollback/escalation decision surface.
- `validate-recovery-decision.sh`: deterministic validator and bounded live probe.
- docs/README updates: make the new surface discoverable and explain its role before queue execution.
- CI/static checks: keep the new validator enforced.
- logs: preserve planning/coding evidence per repo convention.

## What Logic Belongs There
- classify known failure types from bounded inputs
- choose a single recommended action with explicit reasons and stop threshold
- preserve references to validation evidence, notes, retry count, and failed models already observed

## What Should Not Go There
- queue execution
- destructive rollback automation
- broad orchestration redesign
- hidden retries without visible reasons

## Dependencies
- Existing task validation state in `till-done.ts`
- Existing recovery action vocabulary from handoff/runtime docs

## Acceptance Criteria
- Tool returns explicit retry/rollback/stop/escalation recommendation from bounded failure evidence.
- Output preserves or echoes the evidence used for the decision.
- Validator covers at least same-lane retry, stronger action after repeated failure, and rollback/escalation triggers.
- CI/static checks include the new validator.

## Likely Failure Modes
- overfitting recovery heuristics so outputs become hard to explain
- duplicating handoff action enums inconsistently
- missing repo-state or approval-required cases and accidentally recommending blind retry
- forgetting to wire the validator into CI/static checks

## Validation Plan
- RED: run the new validator script before the tool exists and confirm missing-extension failure.
- GREEN: run the new validator script after implementation.
- Quality gates: `./scripts/check-repo-static.sh` and targeted YAML parse for `.github/workflows/ci.yml`.

## Recommended Next Step
- Use the repo's existing recovery policy/runtime surfaces as the implementation base, wire them into CI/static checks/docs, and avoid adding a duplicate recovery tool.

## Correction / Final Direction (2026-04-20 22:05:00 +0700)
- During implementation review, discovered the repo already contains richer HARNESS-030/031 surfaces:
  - `.pi/agent/extensions/recovery-policy.ts`
  - `.pi/agent/extensions/recovery-runtime.ts`
  - `.pi/agent/recovery/recovery-policy.json`
  - `scripts/validate-recovery-policy.sh`
  - `scripts/validate-recovery-runtime.sh`
- Final bounded delivery should therefore:
  - wire those existing surfaces into CI/static checks and docs
  - extend compile coverage to include them
  - avoid merging a second redundant `recovery-decision` tool
- Validation target shifts to:
  - `./scripts/validate-recovery-policy.sh`
  - `./scripts/validate-recovery-runtime.sh`
  - `./scripts/check-foundation-extension-compile.sh`
  - `./scripts/check-repo-static.sh`
