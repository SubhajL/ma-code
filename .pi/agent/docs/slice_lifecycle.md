# Slice Lifecycle Policy

Phase 6 adds an assess-first lifecycle model for bounded harness implementation slices. It unifies evidence that already exists in planning logs, coding logs, task state, git artifacts, PR submission output, PR-gate checks, and sync-main evidence. It does **not** introduce a new mutable runtime state machine.

This implementation slice lifecycle is intentionally separate from the product-slice planning/DAG lifecycle in `.pi/agent/docs/product_slice_lifecycle.md` and `.pi/agent/extensions/product-slice-lifecycle.ts`. Product-slice lifecycle controls Stitch/FE/BE product phase order; this implementation lifecycle controls coding/review/PR/merge evidence.

## Machine-readable policy

- Policy file: `.pi/agent/lifecycle/slice-lifecycle-policy.json`
- Helper: `.pi/agent/extensions/slice-lifecycle.ts`
- CLI: `scripts/harness-slice-lifecycle.ts`
- Dedicated validator: `scripts/validate-slice-lifecycle.sh`

## Checkpoints

| Checkpoint | Meaning | Expected evidence |
|---|---|---|
| `intake_required` | Intake/planning was considered or intentionally exempted. | Planning/current-log pointer or explicit direct-implementation exemption. |
| `planning_ready` | A plan exists with acceptance/TDD direction. | `logs/CURRENT.md` points at a planning log under `reports/planning/`. |
| `task_ready` | Runtime task discipline is active. | `tasks.json` has an active/reviewable task with acceptance, or task status proves readiness. |
| `coding_red` | Tests-first failure evidence exists. | Active coding log contains RED evidence. |
| `coding_green` | Changed behavior has passing evidence. | Active coding log contains GREEN evidence. |
| `review_ready` | Implementation evidence is ready for review. | GREEN evidence plus validated/reviewable task state. |
| `checked` | Skeptical review completed. | Active coding log contains a g-check review and `Review Verdict: no_required_fixes`. |
| `create_ready` | A branch/commit artifact may be created. | Planning + task + RED/GREEN + g-check evidence. |
| `created` | Commit/branch artifact exists. | g-create summary, branch, and commit evidence. |
| `submitted` | PR has been created or updated. | g-submit summary with PR URL/state. |
| `pr_gate_clean` | PR gate reports clean checks/review triage. | PR-gate output with clean/pass evidence. |
| `merge_ready` | PR can be considered for merge. | Submitted PR plus PR-gate clean evidence. |
| `merged` | PR merge happened. | Explicit merge evidence only in Phase 6. |
| `local_main_synced` | Local root main matches remote main after merge. | sync-main evidence such as `local main equals origin/main` and ahead/behind `0 0`. |

## Evidence locations

- Active pointers: `logs/CURRENT.md`
- Coding evidence: `logs/coding/*.md`
- Planning evidence: `reports/planning/*.md`
- Task evidence: `.pi/agent/state/runtime/tasks.json` when present in the current runtime
- Worktree-safe lifecycle evidence bundle: `reports/lifecycle/<task-id>.merge-evidence.json`, validated by `.pi/agent/state/schemas/lifecycle-evidence.schema.json`
- Git evidence: current branch and cleanliness from local git commands
- PR-gate/sync-main evidence: explicit log sections from existing helpers or operator summaries

## Enforcement posture

Phase 6 is additive and assessment-first:

- The helper reports `currentStage`, missing prerequisites, blocking gaps, and next allowed actions.
- `g-create` and `g-submit` should consult lifecycle readiness when evidence is expected.
- Merge execution is enforced by `harness:merge`, which may consume an explicit lifecycle evidence bundle for isolated worktree runs.
- `merged` and `local_main_synced` are recognized only from explicit evidence, not live GitHub polling.

## Operator examples

```bash
npm run harness:slice-lifecycle -- status
npm run harness:slice-lifecycle -- check --stage create_ready
npm run harness:slice-lifecycle -- check --stage merge_ready --json
npm run harness:slice-lifecycle -- check --stage merge_ready --evidence-file reports/lifecycle/<task-id>.merge-evidence.json --json
npm run harness:merge -- check --pr <number> --lifecycle-evidence reports/lifecycle/<task-id>.merge-evidence.json
```

Lifecycle evidence bundles are additive, not a bypass. A bundle may satisfy worktree-safe lifecycle stages only when it records acceptance/TDD or direct-implementation exemption, task acceptance, passing validation, RED/GREEN evidence, `Review Verdict: no_required_fixes`, branch/commit evidence, PR URL/state, and PR-gate clean/pass evidence. Missing or failing evidence still blocks `merge_ready`.

Use the lifecycle helper before claiming create-ready, submit-ready, or merge-ready states. If the helper reports blockers, collect the missing evidence rather than inventing a bypass.
