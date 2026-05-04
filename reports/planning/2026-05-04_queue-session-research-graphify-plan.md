# Queue-Session Research Graphify Integration Plan

## Discovery Path
- Read `AGENTS.md`, `README.md`, `logs/CURRENT.md`, and g-planning guidance.
- Used bounded `auggie_discover`; it timed out and recommended local fallback.
- Local fallback inspected `.pi/agent/extensions/queue-runner.ts`, `scripts/harness-queue-session.ts`, queue schemas, queue-runner/session tests, `graphify-orchestrator.ts`, Graphify docs, and validator scripts.
- Used `second_model_plan`; it agreed on explicit opt-in for research-only jobs, one bounded invocation per session, tests for opt-in/no-op cases, docs/schema updates, and validator wiring.

## Goal
- Add queue-session integration so explicitly opted-in research jobs can invoke `run_graphify_orchestration` during a bounded queue session.

## Non-Goals
- Do not automatically run Graphify for all research jobs.
- Do not run Graphify for non-research jobs even if the field is present.
- Do not add a free-running daemon, hidden loop, or Graphify CLI `--watch` path.
- Do not reimplement `graphify_adapter` or `run_graphify_orchestration` internals.
- Do not directly edit protected runtime JSON in normal operation.

## Assumptions
- A research job is identified by `taskClass: research`, `workType: research_only`, `assignedRole: research_worker`, or `domains` containing `research`.
- The queue job should carry explicit `graphifyOrchestration` input, not a global policy switch.
- Queue-session integration should run at most one Graphify orchestration call per session and record visible queue-note/session-step evidence.

## Cross-Model Check
- Second-model plan recommended an explicit opt-in field, research-only gate, one invocation per session, tests for enabled/disabled/non-research cases, and schema/docs updates.
- Adjustment: use a queue-job field `graphifyOrchestration` rather than task-packet fields so the queue session can invoke Graphify before/while starting a queued research job.

## Plan Draft A
- Add optional `graphifyOrchestration` to `QueueJob` and queue schema.
- In `runBoundedQueueSession`, before starting an eligible queued research job, call `run_graphify_orchestration` once per session when the field is present and enabled.
- Record result in queue job notes and the session step.
- Pros: directly satisfies queue-session integration; no effect on one-step runner.
- Cons: adds session-specific pre-start logic.

## Plan Draft B
- Integrate Graphify orchestration into `runNextQueueJob` for all one-step and session starts.
- Pros: one code path for all queue advancement.
- Cons: wider behavior change; could surprise one-step operators and make explicit queue-session scope less clear.

## Unified Plan
- Use Draft A: queue-session-only, explicit, research-gated integration.
- Add `graphifyOrchestration` queue-job input with `enabled`, `need`, `purpose`, `sourcePath`, `taskId`, freshness/query/proof fields, and adapter-safe options.
- `runBoundedQueueSession` checks the next eligible queued job before `runNextQueueJob`.
- If explicit research Graphify input exists and no session invocation has happened, run `run_graphify_orchestration` once.
- If orchestration is blocked, mark the job blocked and stop the session visibly.
- If orchestration completes, record a queue note and then let normal queue start/finalize flow proceed.

## Files to Modify
- `.pi/agent/extensions/queue-runner.ts`
- `.pi/agent/state/schemas/queue.schema.json`
- `tests/extension-units/queue-runner.test.ts`
- `scripts/validate-queue-runner.sh`
- `scripts/validate-core-workflows.sh`
- `scripts/check-repo-static.sh`
- `.pi/agent/docs/queue_semantics.md`
- `.pi/agent/docs/operator_workflow.md`
- `README.md`
- `logs/CURRENT.md`

## New Files
- `reports/planning/2026-05-04_queue-session-research-graphify-plan.md`
- `logs/coding/2026-05-04_queue-session-research-graphify.md`

## TDD Sequence
1. Add queue-runner test for a research queue job with explicit `graphifyOrchestration` and assert queue-session records Graphify orchestration evidence.
2. Run the targeted test and confirm it fails for the right reason: queue-session lacks Graphify orchestration step/note.
3. Implement the smallest queue-session-only Graphify invocation path to pass the research opt-in test.
4. Add tests for no invocation when research job lacks explicit input and when non-research job has the field.
5. Refactor minimally while green.
6. Wire schemas/validators/docs/static checks and rerun fast gates.

## Test Coverage
- Research job with explicit `graphifyOrchestration` invokes `run_graphify_orchestration` once and then starts normally.
- Research job without explicit field does not invoke Graphify.
- Non-research job with explicit field does not invoke Graphify.
- Blocked Graphify orchestration blocks the job visibly before task start.
- Session step/final inspection expose Graphify evidence.

## Acceptance Criteria
- Queue-session can explicitly invoke Graphify orchestration for research jobs.
- Invocation is opt-in, research-gated, and at most once per bounded session.
- No watch/daemon/background behavior is added.
- Queue schema/docs/static checks describe the explicit field.
- Targeted and relevant validators pass.
- PR merges to `main`; root local `main` syncs to `origin/main`.

## Wiring Checks
| Component | Runtime entry point | Registration | Schema/table | Verification |
| --- | --- | --- | --- | --- |
| queue-session research Graphify | `runBoundedQueueSession` in `.pi/agent/extensions/queue-runner.ts` | existing `run_bounded_queue_session` tool and `scripts/harness-queue-session.ts` | queue job `graphifyOrchestration` in `.pi/agent/state/schemas/queue.schema.json` | queue-runner unit tests, queue-runner validator, core workflow validator, static checker |
| Graphify invocation | existing `run_graphify_orchestration` | existing `.pi/agent/extensions/graphify-orchestrator.ts` | TypeBox tool schema only | queue-session test checks step/note details and no direct adapter reimplementation |

## Validation
- `npx --yes tsx --test tests/extension-units/queue-runner.test.ts`
- `bash scripts/validate-queue-runner.sh --skip-live --report /tmp/queue-session-research-graphify-queue.md --summary-json /tmp/queue-session-research-graphify-queue.json`
- `bash scripts/validate-extension-unit-tests.sh --report /tmp/queue-session-research-graphify-ext.md --summary-json /tmp/queue-session-research-graphify-ext.json`
- `bash scripts/validate-core-workflows.sh --report /tmp/queue-session-research-graphify-core.md --summary-json /tmp/queue-session-research-graphify-core.json`
- `bash scripts/check-foundation-extension-compile.sh`
- `bash scripts/check-repo-static.sh`
- `git diff --check`
- PR gate, merge, root sync.

## Risks
- Running Graphify inside queue-session could surprise operators if not strictly explicit; mitigate with `enabled === true` and research gate.
- Graphify blocked results must not let the job start; test this explicitly.
- Isolated validators that compile queue-runner must copy Graphify orchestrator dependencies.
- Avoid root worktree drift by using only explicit `cd /Users/subhajlimanond/dev/ma-code-worktrees/task-1777879930451-queue-session-research-graphify && ...` for mutations.

## Pi Log Update
- Planning log: `reports/planning/2026-05-04_queue-session-research-graphify-plan.md`
- Coding log: `logs/coding/2026-05-04_queue-session-research-graphify.md`
