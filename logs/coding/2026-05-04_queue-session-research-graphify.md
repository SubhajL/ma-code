# Queue-Session Research Graphify Integration

## Work Summary (2026-05-04 local) - planning and setup

### Goal
- Add queue-session integration so explicitly opted-in research jobs can invoke `run_graphify_orchestration`.

### Files Changed and Why
- `reports/planning/2026-05-04_queue-session-research-graphify-plan.md`: g-planning plan with discovery, Draft A/B, synthesis, TDD sequence, wiring, and validation.
- `logs/coding/2026-05-04_queue-session-research-graphify.md`: implementation evidence log.
- `logs/CURRENT.md`: will point at this feature-group log pair.

### Tests Added or Changed
- pending RED test.

### RED Evidence
- pending.

### GREEN Evidence
- pending.

### Other Validation Commands
- pending.

### Wiring Verification
- pending.

### Behavior Changes and Risk Notes
- Integration must remain explicit, research-gated, one-call-per-session, and no-watch/no-daemon.

## Work Summary (2026-05-04 local) - RED queue-session research Graphify tests

### Goal
- Add behavior-first tests for explicit research job Graphify orchestration during bounded queue sessions.

### Files Changed and Why
- `tests/extension-units/queue-runner.test.ts`: added tests for opted-in research invocation, no implicit research invocation, non-research opt-in ignored, and blocked Graphify orchestration blocking the job.

### Tests Added or Changed
- Added 4 queue-runner tests covering explicit queue-session Graphify behavior.

### RED Evidence
- `npx --yes tsx --test tests/extension-units/queue-runner.test.ts` failed before implementation:
  - opted-in research test had `result.details.steps[0].graphifyOrchestration` undefined instead of a Graphify result.
  - no-opt-in and non-research tests saw undefined rather than the expected explicit null field.
  - blocked Graphify test returned `waiting_on_active_task` instead of `blocked`, proving the queue session did not invoke or block on Graphify.

### GREEN Evidence
- pending.

### Other Validation Commands
- none yet.

### Wiring Verification
- pending implementation.

### Behavior Changes and Risk Notes
- Tests require explicit opt-in and research gating; non-research jobs must not invoke Graphify even if the field is present.

## Work Summary (2026-05-04 local) - GREEN queue-session integration and validation

### Goal
- Implement explicit queue-session Graphify orchestration for research jobs and wire schema/docs/validators.

### Files Changed and Why
- `.pi/agent/extensions/queue-runner.ts`: added `graphifyOrchestration` queue-job input, research-gated queue-session invocation, session-step summary, queue-note/audit recording, and blocked-result handling before task start.
- `.pi/agent/state/schemas/queue.schema.json`: documents/validates optional `graphifyOrchestration` queue-job input.
- `tests/extension-units/queue-runner.test.ts`: added tests for explicit research invocation, no implicit invocation, non-research ignore, and blocked orchestration.
- `scripts/validate-queue-runner.sh`: copies Graphify adapter/orchestration dependencies and expects research Graphify orchestration test coverage.
- `scripts/validate-core-workflows.sh`: copies/compiles Graphify orchestration dependencies with queue-session/core workflow surfaces.
- `scripts/validate-queue-semantics.sh`: validates the queue schema includes explicit research Graphify orchestration input.
- `scripts/check-repo-static.sh`: asserts queue-runner/schema/docs/validator wiring.
- `README.md`, `.pi/agent/docs/operator_workflow.md`, `.pi/agent/docs/queue_semantics.md`: document explicit research queue-session Graphify behavior.
- Planning/coding logs and `logs/CURRENT.md`: evidence and active log pointer.

### Tests Added or Changed
- Added 4 queue-runner behavior tests.

### RED Evidence
- `npx --yes tsx --test tests/extension-units/queue-runner.test.ts` failed before implementation because queue-session steps lacked `graphifyOrchestration`, no-op cases returned `undefined` rather than explicit `null`, and the blocked Graphify path incorrectly started/waited on a task instead of blocking the queue job.

### GREEN Evidence
- `npx --yes tsx --test tests/extension-units/queue-runner.test.ts` passed with 35/35 tests after implementation.
- Flake check: 3 consecutive targeted queue-runner test runs passed with 35/35 tests each.

### Other Validation Commands
- `bash scripts/check-foundation-extension-compile.sh` passed with `foundation-extension-compile-ok`.
- `bash scripts/validate-queue-runner.sh --skip-live --report /tmp/queue-session-research-graphify-queue.md --summary-json /tmp/queue-session-research-graphify-queue.json` passed with `Queue-runner validation PASS`.
- `bash scripts/validate-extension-unit-tests.sh --report /tmp/queue-session-research-graphify-ext.md --summary-json /tmp/queue-session-research-graphify-ext.json` passed with `Extension unit-test validation PASS`.
- `bash scripts/validate-core-workflows.sh --report /tmp/queue-session-research-graphify-core.md --summary-json /tmp/queue-session-research-graphify-core.json` passed with `core-workflows-validation: PASS`.
- `bash scripts/validate-queue-semantics.sh --report /tmp/queue-session-research-graphify-semantics.md --summary-json /tmp/queue-session-research-graphify-semantics.json` passed with `Queue-semantics validation PASS`.
- `bash scripts/check-repo-static.sh` passed with `prompt-contract-validation: PASS (29 prompt files checked)` and `repo-static-checks-ok`.
- `git diff --check` passed with no output.

### Wiring Verification
- Existing `run_bounded_queue_session` now calls `maybeRunResearchGraphifyForNextQueuedJob` before `runNextQueueJob` for eligible explicit research jobs.
- Queue schema includes `graphifyOrchestration` and restricts known orchestration fields/purpose/cadence values.
- Queue-runner isolated validator copies `graphify-adapter.ts`, `graphify-orchestration-decision.ts`, and `graphify-orchestrator.ts` alongside queue-runner.
- Core workflow isolated compile copies/compiles Graphify orchestration dependencies with `scripts/harness-queue-session.ts`.
- Static checker asserts queue-runner code, queue schema, docs, queue-runner validator, and core workflow validator wiring.

### Behavior Changes and Risk Notes
- Graphify orchestration is queue-session-only, explicit (`graphifyOrchestration.enabled: true`), research-gated, and at most once per bounded session.
- Non-research jobs with the field are ignored.
- Blocked Graphify orchestration blocks the queued job before task start.
- No `--watch`, daemon, background loop, or automatic Graphify-for-all-research behavior was added.

## Work Summary (2026-05-04 local) - final static/doc validation

### Goal
- Re-run static and queue-semantics validation after docs/static refinements.

### Files Changed and Why
- `.pi/agent/docs/queue_semantics.md`: clarified `graphifyOrchestration.enabled: true` wording for static/doc discoverability.
- `scripts/check-repo-static.sh`: asserts explicit research Graphify queue-session wiring across queue-runner, schema, docs, and validators.

### Tests Added or Changed
- No new tests in this unit.

### RED Evidence
- Existing RED: queue-runner test failed before implementation due missing Graphify orchestration step/blocking behavior.

### GREEN Evidence
- Targeted queue-runner tests remain green with 35/35 passing.

### Other Validation Commands
- `bash scripts/validate-queue-semantics.sh --report /tmp/queue-session-research-graphify-semantics-2.md --summary-json /tmp/queue-session-research-graphify-semantics-2.json` passed with `Queue-semantics validation PASS`.
- `bash scripts/check-repo-static.sh` passed with `prompt-contract-validation: PASS (29 prompt files checked)` and `repo-static-checks-ok`.
- `git diff --check` passed with no output.

### Wiring Verification
- Queue schema, queue semantics docs, operator workflow, README, queue-runner validator, core workflow validator, and static checker now include the explicit research Graphify queue-session contract.

### Behavior Changes and Risk Notes
- Documentation/static coverage only; runtime behavior unchanged from GREEN implementation.

## Work Summary (2026-05-04 local) - QCHECK safety refinement

### Goal
- Address self-review concern that explicit Graphify could run for a queued job that normal queue-start controls would immediately block.

### Files Changed and Why
- `.pi/agent/extensions/queue-runner.ts`: changed `graphifyQueueJobIsSafeToEvaluate` to check acceptance criteria, approval boundary, unsupported controls, visible unresolved blocker budget, and linked-task retry/validation budgets before invoking Graphify.

### Tests Added or Changed
- Existing queue-runner tests cover acceptance, approval, blocker, retry, and validation budget behavior plus research Graphify paths.

### RED Evidence
- Existing RED: queue-runner test failed before implementation due missing Graphify orchestration step/blocking behavior.

### GREEN Evidence
- `npx --yes tsx --test tests/extension-units/queue-runner.test.ts` passed with 35/35 tests after the QCHECK refinement.
- Final flake check: 3 consecutive targeted queue-runner runs passed with 35/35 tests each.

### Other Validation Commands
- `bash scripts/check-foundation-extension-compile.sh` passed with `foundation-extension-compile-ok`.
- `bash scripts/validate-queue-runner.sh --skip-live --report /tmp/queue-session-research-graphify-queue-2.md --summary-json /tmp/queue-session-research-graphify-queue-2.json` passed with `Queue-runner validation PASS`.
- `bash scripts/validate-extension-unit-tests.sh --report /tmp/queue-session-research-graphify-ext-2.md --summary-json /tmp/queue-session-research-graphify-ext-2.json` passed with `Extension unit-test validation PASS`.
- `bash scripts/validate-core-workflows.sh --report /tmp/queue-session-research-graphify-core-2.md --summary-json /tmp/queue-session-research-graphify-core-2.json` passed with `core-workflows-validation: PASS`.
- `bash scripts/validate-queue-semantics.sh --report /tmp/queue-session-research-graphify-semantics-3.md --summary-json /tmp/queue-session-research-graphify-semantics-3.json` passed with `Queue-semantics validation PASS`.
- `bash scripts/check-repo-static.sh` passed with `prompt-contract-validation: PASS (29 prompt files checked)` and `repo-static-checks-ok`.
- `git diff --check` passed with no output.

### Wiring Verification
- `run_bounded_queue_session` invokes Graphify only after the same visible pre-start safety controls say the eligible research job is safe to evaluate.

### Behavior Changes and Risk Notes
- This reduces unnecessary Graphify side effects for jobs that would be blocked before start.

## Review (2026-05-04 local) - working-tree

### Reviewed
- Repo: `/Users/subhajlimanond/dev/ma-code-worktrees/task-1777879930451-queue-session-research-graphify`
- Branch: `split/task-1777879930451-queue-session-research-graphify`
- Scope: working-tree
- Commands Run:
  - `git status --short --branch`
  - `git diff --stat`
  - `git diff -- .pi/agent/extensions/queue-runner.ts tests/extension-units/queue-runner.test.ts .pi/agent/state/schemas/queue.schema.json scripts/validate-queue-runner.sh scripts/validate-core-workflows.sh scripts/check-repo-static.sh | sed -n '1,360p'`
  - `rg -n -- "--watch|graphifyOrchestration|run_graphify_orchestration|maybeRunResearchGraphify" ...`
  - Validation commands listed above.

### Findings
CRITICAL
- none

HIGH
- none

MEDIUM
- none

LOW
- none

### Open Questions / Assumptions
- Assumes explicit queue-session Graphify invocation should happen only for the next eligible queued job and at most once per bounded session.
- Assumes non-research jobs with `graphifyOrchestration` should be ignored rather than blocked.

### Recommended Tests / Validation
- Completed targeted queue-runner unit tests, isolated queue-runner validator, extension unit-test validator, core workflow validator, queue-semantics validator, foundation compile, static checks, and `git diff --check`.

### Rollout Notes
- Queue authors must opt in with `graphifyOrchestration.enabled: true`; behavior remains research-gated and queue-session-only.
