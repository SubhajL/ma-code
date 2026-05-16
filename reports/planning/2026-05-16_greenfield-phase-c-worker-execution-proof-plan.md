# Greenfield Phase C Worker Execution Proof Plan

- Date: 2026-05-16
- Task: `task-1778907456348`
- Coding log: `logs/coding/2026-05-16_greenfield-phase-c-worker-execution-proof.md`
- Intake: direct planning request; no implementation in this task.
- Decision: Phase B is complete for candidate-only queue-readiness semantics; Phase C should not start live execution until the worker-execution gate is green.

## Discovery evidence
- Auggie attempted first and timed out; local `read`/`rg`/targeted command discovery used as fallback.
- Phase B artifacts exist on `origin/main` and `HEAD`: `docs/initiatives/greenfield-scaffold/phase-b-queue-readiness.md`, `scripts/validate-greenfield-phase-b.mjs`, `tests/integration/greenfield-phase-b-queue-readiness.test.ts`, and Phase B planning/coding logs.
- `node scripts/validate-greenfield-phase-b.mjs --json` reports `queueReadiness: candidate_only`, `workerExecution: disabled`, `runtimeMutation: disabled`, `candidateCount: 3`, and `errors: []`.
- `npm run validate:greenfield-phase-b` passed.
- `npm run validate:greenfield-docs` passed.
- Queue state has no queued/running jobs; existing Greenfield issue-materialization jobs are done.
- Greenfield issue, slice-plan, and pipeline artifacts list issue-001 through issue-018 complete/done, while source `queueReadiness` remains `not_ready` by Phase B design.
- `npm run test:worker-execution` currently fails one integration test: `CLI dry-run/status/explain-run and run enforce Phase C boundaries`, expected `review_ready`, actual `blocked`, at `tests/integration/worker-execution.test.ts:84`.

## Recommendation
- Treat Phase B as done for its defined scope: safe candidate-only queue-readiness semantics, no runtime mutation, no autonomous execution.
- Do not begin a live Phase C worker run until `npm run test:worker-execution` / `npm run validate:worker-execution` pass.
- Create a distinct Phase C runtime issue/backlog item; do not reopen or rematerialize the completed Greenfield product scaffold issues directly.
- Materialize exactly one synthetic/proof Phase C queue job after the Phase C issue has acceptance criteria and worker-execution gates are green.
- Preserve Phase B validator semantics; add Phase C-specific validation rather than changing Phase B from `workerExecution: disabled`.

## First TDD slice
- Tracer behavior: one explicit Phase C command/flow converts a Phase B candidate reference into one bounded `worker_job` proof and stops at review/proof without autoland.
- Public interface: existing `npm run harness:worker-execute -- ...` / `scripts/harness-worker-execute.ts` path, or a minimal wrapper only if existing wiring cannot express candidate-derived proof jobs.
- Boundary dependencies: queue runner/materialization, worker execution artifact writer, allowed-path guard, HITL/approval checks, task packet generation, and validation scripts.
- Mock/fake plan: integration fixture initiative/candidate and fake worker command that writes allowed proof only; no live provider loop for RED/GREEN.
- Out of scope: product scaffold expansion, daemonized AFK loops, multi-job draining, autoland/merge, direct runtime JSON edits, and bypassing HITL gates.

## Acceptance criteria
- Existing worker-execution failing integration is fixed or explicitly rebaselined for the right reason.
- Phase C has a distinct issue/backlog artifact with acceptance and proof expectations.
- One candidate-derived proof job can be materialized through normal tooling with `queueJobSource`/provenance, allowed paths, approval/HITL policy, and validation expectations.
- One bounded worker execution path reaches review/proof state and writes a worker-run artifact.
- No source Greenfield `queueReadiness: not_ready` artifacts are silently flipped to executable jobs.
- Phase B validations remain green and continue reporting `workerExecution: disabled` for Phase B.

## Validation commands
- `npm run test:worker-execution`
- `npm run validate:worker-execution`
- `npm run validate:greenfield-phase-b`
- `npm run validate:greenfield-docs`
- `node --import tsx --test tests/integration/queue-reconcile.test.ts tests/integration/afk-orchestration.test.ts` when materialization logic changes
- `git diff --check`

## Risks
- Starting Phase C while worker-execution tests are red would turn a known boundary failure into live runtime risk.
- Reusing completed product issues directly could blur product completion with runtime proof work.
- Changing Phase B validator to report execution enabled would weaken the phase boundary; prefer a Phase C validator or proof artifact.
- Current branch has unrelated model-settings delta and an existing dirty coding log; implementation should use a clean task branch/worktree.
