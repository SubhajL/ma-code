# Greenfield Phase B Queue-Readiness Delivery Plan

- Date: 2026-05-16
- Task: `task-1778899721795`
- Coding log: `logs/coding/2026-05-16_greenfield-phase-b-queue-readiness-delivery.md`
- Intake: direct planning request; no implementation in this task.
- Planning question: can supervised auto-worker delivery take Phase B from planning through remote/local `main` landing?

## Decision summary
- Use supervised automation for Phase B implementation/review/PR preparation, but do **not** use a single ungated autonomous chain from planning to `main`.
- Keep Phase B scoped to queue-readiness contract/conversion proof.
- Keep autonomous worker execution proof in Phase C.
- Keep merge to remote `main` as a HITL gate; local `main` sync may be automated only after merge and only with a clean worktree plus fast-forward semantics.

## Discovery path
- Read `logs/CURRENT.md`, g-planning skill, and Pi log convention.
- Inspected queue/task state: no active job/task before this planning task, no blocked/failed queue jobs, three tasks still in `review`.
- Auggie discovery was attempted and timed out; local fallback used.
- Inspected Greenfield docs and policy:
  - `docs/initiatives/greenfield-scaffold/README.md`
  - `docs/initiatives/greenfield-scaffold/validation.md`
  - `docs/initiatives/greenfield-scaffold/slice-plan.json`
  - previous active planning/coding logs
- Inspected harness test surfaces and scripts:
  - `package.json`
  - `tests/integration/queue-session.test.ts`
  - `tests/extension-units/queue-runner.test.ts`
  - related queue/task/reconcile test file list
- Second-model check requested; retained only safety-compatible advice and rejected raw/protected runtime-state mutation suggestions.

## Goal
- Deliver Phase B as a safe queue-readiness contract and conversion proof for Greenfield artifacts.
- Permit supervised auto-worker help for implementation tasks on an isolated branch/worktree.
- Produce PR-ready evidence and submission artifacts.
- Land on remote `main` only through HITL merge approval.
- Sync local `main` only after remote merge, via clean fast-forward update.

## Non-goals
- No direct edits on `main`.
- No force push or destructive git history operation.
- No raw edits to `.pi/agent/state/runtime/*.json`.
- No autonomous Greenfield worker execution in Phase B.
- No product scaffold expansion beyond tiny fixtures needed to prove queue-readiness validation.
- No bypass of g-check/reviewer/validator gates.

## Success criteria
- Phase B has explicit queue-readiness semantics documented and validated.
- A deterministic converter/validator can classify or derive queue-ready Greenfield work without mutating runtime state unexpectedly.
- Tests prove queue-ready artifacts can be produced while worker execution remains disabled/not invoked.
- PR is created with complete evidence and no required fixes.
- Human approves/merges PR to remote `main`.
- Local `main` is fast-forward synced after merge.

## Draft A - supervised auto-worker pipeline
- Seal current reconciliation work first.
- Create isolated Phase B branch/worktree.
- Generate a Phase B implementation task packet for a build worker.
- Let a supervised worker implement the converter/validator and docs.
- Run g-check reviewer and validator worker.
- Use g-create/g-submit to prepare commit/PR.
- Stop at HITL merge approval.
- After human merge, run safe local sync.

## Draft B - manual implementation pipeline
- Seal current reconciliation work first.
- Use a human/operator to implement Phase B locally on a branch.
- Use auto workers only for review/validation.
- Submit PR manually.
- Merge and sync manually.

## Synthesis
- Prefer Draft A with strict gates.
- Rationale: Phase B is harness-runtime-adjacent but bounded enough for supervised worker implementation if the worker cannot merge to `main` and cannot exercise Phase C autonomous execution.
- Keep Draft B as fallback if queue/session behavior becomes unreliable or provider/runtime evidence is contradictory.

## Proposed implementation surface
- Add a Phase B queue-readiness contract doc under `docs/initiatives/greenfield-scaffold/`.
- Add or extend a deterministic validation/conversion script that reads Greenfield artifacts and emits a dry-run/derived queue-readiness report.
- Add tests for ready/not-ready classification and guardrail preservation.
- Optionally add a package script for Phase B validation.
- Do not enqueue runnable jobs in Phase B unless the operation is explicitly dry-run/non-executing.

## First TDD slice
- First tracer behavior: given a Phase A Greenfield issue artifact with required fields and explicit approval metadata, the Phase B validator reports it as `queue_ready_candidate` while preserving `workerExecution: disabled` / no execution side effects.
- Public interface: a package script such as `npm run validate:greenfield-phase-b` or a bounded script such as `scripts/validate-greenfield-phase-b.mjs`.
- Boundary dependencies: read-only Greenfield docs/artifacts; fake/temp fixture files in tests; no runtime JSON mutation.
- Mock/fake plan: tests use temporary fixture artifacts or committed test fixtures, not live runtime state.
- Out of scope: actual queue pickup, worker process execution, remote merge automation, product feature scaffolding.

## TDD sequence
1. Add/stub test for the first tracer behavior.
2. Run the targeted test and confirm it fails because the Phase B validator/converter does not exist or does not yet classify candidates.
3. Implement the smallest validator/converter behavior needed to pass.
4. Add guardrail test proving Phase B output does not mark work as executable/running and does not mutate runtime state.
5. Refactor minimally for clear schema/types/messages.
6. Run targeted tests again.
7. Run docs/scaffold validation gates.
8. Run g-check and validator gates before submit.

## Likely files to modify
- `docs/initiatives/greenfield-scaffold/README.md`
- `docs/initiatives/greenfield-scaffold/readiness-checklist.md`
- `docs/initiatives/greenfield-scaffold/validation.md`
- `docs/initiatives/greenfield-scaffold/phase-b-queue-readiness.md` (new)
- `package.json`
- `scripts/validate-greenfield-phase-b.mjs` or equivalent (new)
- `tests/integration/greenfield-phase-b-queue-readiness.test.ts` or equivalent (new)
- active Pi logs under `reports/planning/` and `logs/coding/`

## Wiring verification table
| Component | Runtime entry point | Registration location | Schema/state impact | Verification |
| --- | --- | --- | --- | --- |
| Phase B validator/converter | `npm run validate:greenfield-phase-b` | `package.json` scripts | Reads Greenfield artifacts; no runtime JSON mutation | Targeted test plus command output |
| Queue-readiness contract doc | `docs/initiatives/greenfield-scaffold/phase-b-queue-readiness.md` | Linked from README/validation/checklist | Documentation only | Docs validator and link/read inspection |
| Guardrail preservation | Validator output/report | Script implementation/tests | Confirms no autonomous execution side effects | Test asserts no queue pickup/execution fields are enabled |
| PR/landing workflow | g-create/g-submit then human merge | Branch/PR metadata | Git only; no direct main edits | PR checks, human approval, post-merge fast-forward sync |

## Auto-worker delivery gates
- Gate 0: current reconciliation work sealed or isolated.
- Gate 1: active Phase B task packet exists with acceptance criteria and allowed paths.
- Gate 2: worker may implement only on a non-main branch/worktree.
- Gate 3: worker must stop after implementation evidence and g-check handoff.
- Gate 4: reviewer/validator must pass.
- Gate 5: g-create/g-submit may create commit/PR.
- Gate 6: human approves/merges remote `main`.
- Gate 7: local `main` sync uses clean worktree and fast-forward only.

## Acceptance checks
- `git status --short` shows no unrelated dirty files before Phase B implementation starts.
- `inspect_queue_state recentLimit=5 includeHistory=false` shows no blocked/failed active runtime state.
- Targeted RED/GREEN test for Phase B queue-readiness candidate behavior passes.
- Guardrail test proves Phase B does not perform autonomous worker execution.
- `npm run validate:greenfield-docs`
- `npm run validate:greenfield-scaffold`
- `git diff --check`
- g-check verdict: `no_required_fixes`.
- PR exists and is linked to the active task.
- Remote `main` merge has explicit human approval.
- Local `main` sync is fast-forward only after remote merge.

## Risks
- Conflating delivery auto-worker usage with Phase C autonomous worker execution.
- Accidentally mutating protected runtime state while proving queue-readiness.
- Letting a worker merge or sync `main` without HITL approval.
- Dirty current working tree mixing reconciliation cleanup with Phase B changes.
- Existing validators intentionally expect `queueReadiness: not_ready`; Phase B must add new semantics without silently breaking Phase A guardrails.

## Open questions
- Should Phase B output be a derived report only, or should it also materialize new queue-ready candidate artifacts under docs?
- Should candidate artifacts be generated for all Greenfield slices or only one tracer issue first?
- Which PR target workflow should be used: Graphite-first g-submit or GitHub fallback?

## Pre-Phase-B cleanup recommendation (2026-05-16 10:10:37 +07)

### Current state
- Phase B implementation has not started; current active coding log remains planning-only.
- Task summary shows no blocked/failed tasks, but 3 tasks remain in `review`.
- Current worktree is not sealed: `git status --porcelain=v1` reports tracked modifications and untracked reconciliation/planning artifacts.
- Current branch is not `main`, so the work is partially isolated, but the same branch/worktree still mixes reconciliation, planning, and future Phase B risk.

### Recommendation
- Do not start Phase B implementation in the current dirty worktree.
- Treat stale `review` tasks as a dashboard hygiene blocker, not necessarily a product blocker:
  - If they have evidence and validation, transition them to `done` through task tools.
  - If evidence is missing, keep them visible and add a blocker/note rather than raw-editing runtime state.
  - Do not YOLO-reconcile review tasks unless there is explicit approval and per-task evidence.
- First seal the current reconciliation/planning set, then start Phase B in a fresh branch/worktree.

### Suggested sequence
1. Inventory the 3 review tasks with task tools and classify each as `done-ready`, `needs-validation`, or `blocked/stale`.
2. Resolve only the `done-ready` tasks through `task_update validate`/`done`; record evidence.
3. Run a final review of the current dirty worktree and decide whether this branch should be committed/PR'd as reconciliation+planning cleanup.
4. Commit/submit the current cleanup branch, or explicitly stash/move it aside; do not delete untracked artifacts without human approval.
5. After the branch/worktree is clean or a fresh worktree exists, create the Phase B implementation task packet and begin TDD.

### Acceptance for starting Phase B implementation
- `task_update show`/`inspect_queue_state` has no blocked/failed active work; review tasks are either intentionally deferred or resolved with evidence.
- `git status --short` is clean in the Phase B worktree, or contains only Phase B task files after RED begins.
- Active Phase B task packet exists with acceptance criteria and allowed paths.
