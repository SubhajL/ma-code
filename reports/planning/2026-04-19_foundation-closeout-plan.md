# Planning Log — foundation-closeout

- Date: 2026-04-19
- Scope: Close the remaining foundational partials for HARNESS-008, HARNESS-015, HARNESS-023, and HARNESS-025 in a bounded repo-local pass.
- Status: complete
- Related coding log: `logs/coding/2026-04-19_foundation-closeout.md`

## Discovery Path
- Auggie attempt timed out; used local discovery fallback.
- Inspected:
  - `logs/CURRENT.md`
  - `AGENTS.md`
  - `.pi/agent/docs/task_schema_semantics.md`
  - `.pi/agent/docs/worktree_isolation_policy.md`
  - `.pi/agent/extensions/till-done.ts`
  - `.pi/agent/extensions/safe-bash.ts`
  - `.pi/agent/state/schemas/tasks.schema.json`
  - `scripts/validate-phase-a-b.sh`
  - `.pi/agent/docs/validation_architecture.md`
- Cross-model planning fallback: Anthropic credits unavailable; main model plan only.

## Goal
- Close four blocking foundational tasks enough to support the next orchestration phase with clearer task semantics, richer audit evidence, explicit main-branch protection validation, and a decision-complete worktree policy.

## Non-Goals
- no queue runner or team orchestration runtime
- no packaging/globalization work
- no UI/widget work
- no worktree helper scripts yet
- no changes to provider/model routing beyond existing behavior

## Assumptions
- bounded runtime/doc/validator changes are sufficient to close these partials for the current repo-local harness slice
- extending `scripts/validate-phase-a-b.sh` is the right validator surface for these foundation changes
- helper scripts for worktrees remain a later task; policy closure is enough now

## Cross-Model Check
- attempted `second_model_plan`
- explicit fallback to main/current model because Anthropic credits are unavailable in this environment

## Plan Draft A
- Align task semantics across doc, schema, and runtime:
  - update `tasks.schema.json` to require `dependencies` and `retryCount`
  - update `till-done.ts` transition rules to match the documented contract more closely
  - add `requeue` action
  - require `review` before `done`
  - increment `retryCount` on failed-task retry
  - enforce dependency checks for `done` and block obvious blocked/failed dependencies on `start`
- Tighten audit logging:
  - enrich `safe-bash.ts` and `till-done.ts` audit entries with branch/model/provider/cwd/task metadata
  - log allowed mutating tool attempts, not only blocks
  - add a compact audit-log convention doc
- Close main-branch protection:
  - extend `validate-phase-a-b.sh` with direct write-on-main and mutating-bash-on-main checks
  - document that these are now covered by validator evidence
- Close worktree policy:
  - add a canonical decision table and explicit current-slice closure note to `worktree_isolation_policy.md`

## Plan Draft B
- Keep runtime changes smaller by adjusting docs to current runtime instead of adding `requeue`
- Add only validator checks for existing behavior and avoid new audit-log doc
- Close worktree policy with minor wording only

## Unified Plan
- Use Draft A, but keep code changes minimal and directly tied to the four targets.
- Prefer runtime/doc alignment over doc-only closure where the mismatch is material.
- Use the existing foundation validator as the regression surface instead of introducing a separate new validator.

## Files to Modify
- `.pi/agent/extensions/till-done.ts`
- `.pi/agent/extensions/safe-bash.ts`
- `.pi/agent/state/schemas/tasks.schema.json`
- `.pi/agent/docs/task_schema_semantics.md`
- `.pi/agent/docs/worktree_isolation_policy.md`
- `.pi/agent/docs/validation_architecture.md`
- `.pi/agent/docs/operator_workflow.md`
- `.pi/agent/docs/file_map.md`
- `scripts/validate-phase-a-b.sh`
- `logs/CURRENT.md`
- `logs/coding/2026-04-19_foundation-closeout.md`

## New Files
- `.pi/agent/docs/audit_logging_convention.md`
- `reports/planning/2026-04-19_foundation-closeout-plan.md`
- `logs/coding/2026-04-19_foundation-closeout.md`

## TDD Sequence
- 1. RED: run `./scripts/validate-phase-a-b.sh` after adding new expected checks or before code alignment to capture failures where the current runtime/validator does not yet satisfy the tighter contract.
- 2. Implement the smallest runtime changes in `till-done.ts` and `safe-bash.ts`.
- 3. Update schema/docs to match the implemented contract exactly.
- 4. Extend the validator script with the new bounded checks.
- 5. Run the validator until it passes, then perform a skeptical review.

## Test Coverage
- TypeScript compile check for `safe-bash.ts` and `till-done.ts`
- existing foundation checks
- new main-branch write block check
- new main-branch mutating bash block check
- new `till-done` review-before-done check
- new `requeue` / retryCount / audit-log field checks where practical

## Acceptance Criteria
- task lifecycle semantics are consistent across doc, schema, and runtime for the current slice
- audit logs capture enough context to reconstruct mutating/blocking task and shell events better than before
- main-branch protection is explicitly validated, not just documented
- worktree policy is decision-complete for the current repo-local harness slice and clearly says helper scripts are later
- validator evidence exists for the tightened foundation behavior

## Wiring Checks
| Component | Entry Point | Registration Location | How to Verify |
|---|---|---|---|
| task lifecycle runtime | `task_update` tool | `.pi/agent/extensions/till-done.ts` via `.pi/settings.json` extensions | `validate-phase-a-b.sh` transition/evidence checks pass |
| audit logging | `tool_call`, `task_update`, `agent_end` events | `.pi/agent/extensions/safe-bash.ts`, `.pi/agent/extensions/till-done.ts` | validator checks and JSONL field inspection pass |
| main-branch protection | `tool_call` preflight blocks | `.pi/agent/extensions/safe-bash.ts` | validator main-branch checks pass |
| worktree policy closure | repo docs | `.pi/agent/docs/worktree_isolation_policy.md` | readback shows canonical decision table and current-slice closure note |

## Validation
- primary validator: `./scripts/validate-phase-a-b.sh`
- readback of changed docs and runtime files
- skeptical `g-check`-style review of the bounded diff

## Risks
- stricter `till-done.ts` transitions may require validator prompt updates to keep the scripted flows aligned
- richer audit logs improve evidence but do not yet capture every future orchestration field such as team packet IDs
- worktree policy closure is doc-level until helper scripts are implemented later

## Completion Note
- Completed for the current repo-local harness slice.
- Primary validation artifact: `reports/validation/2026-04-19_phase-a-b-runtime-validation-script.json`
- Result: `status: PASS`, `failedChecks: 0`

## Pi Log Update
- planning log: `reports/planning/2026-04-19_foundation-closeout-plan.md`
- coding log: `logs/coding/2026-04-19_foundation-closeout.md`
