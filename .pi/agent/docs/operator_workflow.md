# Operator Workflow — Current Harness

This workflow explains how to operate the current Pi harness safely and consistently.

## Scope
This workflow covers the current implemented harness slice:
- Pi-native repo wiring
- repo policy and role contracts
- `safe-bash.ts`
- `till-done.ts`
- queue/recovery/runtime validation surfaces
- machine-readable completion-gate policy
- bounded runtime validation and operator-facing status/validator entrypoints

It does not assume:
- a free-running queue daemon beyond the bounded `run_next_queue_job` stepper (`run_queue_once` remains a compatibility alias)
- rich UI widgets or a dashboard daemon
- full team orchestration runtime

For a fast read-only operator snapshot outside a live agent session, use:
```bash
npm run harness:status
npm run harness:status:json
```

Related quickstart:
- `.pi/agent/docs/operator_quickstart.md`

## Daily queue operator loop
When operating queued work in a live harness session, use the runtime tools in this order:

1. inspect current status with `inspect_queue_state`
   - confirm whether the queue is paused
   - confirm the active job and active task
   - review blocked or failed job/task IDs before taking action
2. pause intake with `pause_queue` when you want to stop new pickup without discarding state
3. resume intake with `resume_queue` when visible queue/task state is acceptable again
4. stop safely with `stop_queue_safely` when the current active job should move into a reviewable blocked state
5. advance at most one bounded step with `run_next_queue_job`
6. review evidence, blockers, and validation before declaring work complete

Recommended operator questions during this loop:
- is the queue paused intentionally?
- is there an active running job?
- does the linked active task match the queue state?
- are there blocked or failed items that need a human decision?
- should the next action be resume, stop, or one bounded queue step?

## Core operating loop

### 1. Start from the repo root
```bash
cd /Users/subhajlimanond/dev/ma-code
```

### 2. Work on a bounded branch or worktree
Follow `AGENTS.md`:
- never work directly on `main`
- prefer small bounded changes
- keep scope explicit

### 3. Make or review one bounded change set
Examples:
- config wiring
- schema adjustment
- one runtime extension change
- one validator change

### 4. Run validator before claiming completion
Preferred command:
```bash
./scripts/validate-phase-a-b.sh
```

For `till-done.ts` / completion-gate changes, the validator now covers:
- validation-before-done enforcement
- lighter docs/research validation path
- validator `fail` / `blocked` rejection flow
- explicit manual override path

Useful variants:
```bash
./scripts/validate-phase-a-b.sh --skip-compile
./scripts/validate-phase-a-b.sh --include-fullstack
```

### 5. Save evidence
Record evidence in:
- coding log: `logs/coding/...`
- planning log: `reports/planning/...`
- validation reports: `reports/validation/...`
- runtime audit log when relevant: `logs/harness-actions.jsonl`

## Cross-phase working patterns
These patterns should now guide planning, implementation, and review even before later phases are fully implemented.

### Codebase discovery
- use Auggie MCP first when it is available and non-blocking
- if Auggie is unavailable, errors, or cannot be bounded safely, fall back immediately to local tools
- local fallback means targeted `read`, `grep`/`rg`, `find`, and direct file inspection
- record which discovery path was used when it matters to planning or validation evidence

### Planning discipline
For medium- or high-risk work, planning should make these explicit:
- goal and non-goals
- files to inspect or modify
- validation ideas
- important edge cases
- wiring or registration checks for new runtime components
- whether second-model planning synthesis was used or fell back to single-model planning

### Implementation discipline
When relevant, implementation evidence should include:
- smallest relevant validation or test commands
- failing/pass evidence when practical
- changed files
- wiring verification for new runtime components
- known gaps instead of hidden assumptions

### Review discipline
Review and validation outputs should prefer:
- severity-ordered findings
- exact file references when possible
- concrete fix direction
- named tests or validation still needed

## What the validator script is for
The validator script is not part of the runtime agent loop.
It serves the operator and validator workflow by providing:
- repeatable regression checks
- pass/fail proof for core runtime controls
- cleanup after validation
- machine-readable validation summary

## Validation cost guardrails
Not all validation has the same cost.
For this repo, use this default order:
- cheap/local checks first
  - readback
  - `rg`/`find`
  - compile/typecheck/lint
  - deterministic helper-level tests
- then one live provider-backed validator run only when local evidence is not enough

Repeated live `pi ...` validator reruns are not the default.
Use them only when:
- a human explicitly approves the extra spend, or
- there is a clearly stated flake investigation need and cheaper checks cannot answer it

When a repeated live rerun is used, record:
- why one run was insufficient
- why local evidence was insufficient
- what scope was rerun

## Validation assets
### Primary validators
- `scripts/validate-phase-a-b.sh`
- `scripts/validate-queue-semantics.sh`
- `scripts/validate-extension-unit-tests.sh`
- `scripts/validate-recovery-policy.sh`
- `scripts/validate-recovery-runtime.sh`
- `scripts/validate-queue-runner.sh`
- `scripts/validate-core-workflows.sh`
- `scripts/validate-skill-routing.sh`
- `scripts/validate-harness-routing.sh`
- `scripts/validate-team-activation.sh`
- `scripts/validate-task-packets.sh`
- `scripts/validate-handoffs.sh`
- `scripts/validate-same-runtime-bridge.sh`
- `scripts/collect-harness-tuning-data.sh`

### Supporting docs
- `.pi/agent/docs/runtime_validation_runbook.md`
- this file: `.pi/agent/docs/operator_workflow.md`
- `.pi/agent/docs/operator_quickstart.md`

### Outputs
- markdown report: `reports/validation/*.md`
- JSON summary: `reports/validation/*.json`

## When to run validation
Run the validator script when:
- changing `.pi/settings.json`
- changing `.pi/SYSTEM.md`
- changing `AGENTS.md`
- changing task schema or runtime task state shape
- changing queue schema or runtime queue state shape
- changing `safe-bash.ts`
- changing `till-done.ts`
- changing `.pi/agent/validation/completion-gate-policy.json`
- changing `.pi/agent/extensions/g-skill-auto-route.ts`
- changing `.pi/agent/extensions/recovery-policy.ts`
- changing `.pi/agent/extensions/recovery-runtime.ts`
- changing `.pi/agent/extensions/queue-runner.ts`
- changing `tests/integration/core-workflows.test.ts`
- changing `scripts/validate-core-workflows.sh`
- changing `.pi/agent/recovery/recovery-policy.json`
- changing queue jobs that rely on executable runner linkage fields such as `acceptanceCriteria`, `linkedTaskId`, or packet metadata
- changing `.pi/agent/extensions/harness-routing.ts`
- changing `.pi/agent/models.json` routing policy
- changing `.pi/agent/extensions/team-activation.ts`
- changing `.pi/agent/teams/activation-policy.json`
- changing team membership definitions under `.pi/agent/teams/*.yaml`
- changing `.pi/agent/extensions/task-packets.ts`
- changing `.pi/agent/packets/packet-policy.json`
- changing `.pi/agent/state/schemas/task-packet.schema.json`
- changing `.pi/agent/extensions/handoffs.ts`
- changing `.pi/agent/handoffs/handoff-policy.json`
- changing `.pi/agent/state/schemas/handoff.schema.json`
- changing `.pi/agent/extensions/same-runtime-bridge.ts`
- changing audit logging behavior or expectations
- before calling a bounded phase complete

Choose the validator that matches the change:
- use `npm run harness:status` or `npm run harness:status:json` for a read-only operator snapshot before deciding whether to resume, stop, or advance one queue step
- use `./scripts/validate-phase-a-b.sh` for foundation/runtime-safety changes
- use `./scripts/validate-queue-semantics.sh` for queue schema/semantics changes
- use `./scripts/validate-extension-unit-tests.sh` for extension unit-test coverage across safety/task-discipline/orchestration helper surfaces
- use `./scripts/validate-recovery-policy.sh` for failure taxonomy / provider-failure / retry-eligibility recovery policy changes
- use `./scripts/validate-recovery-runtime.sh` for explicit retry / rollback / stop runtime decision changes
- use `./scripts/validate-queue-runner.sh` for bounded queue start/finalize behavior, stop-condition enforcement (retries/runtime/failed validations/approval boundaries), unsupported-control blocking, and queue-runner wiring changes; it attempts one bounded live probe by default when possible, and `--skip-live` is available for CI/static runs
- use `./scripts/validate-core-workflows.sh` for isolated end-to-end task/queue workflow coverage across docs-only completion, implementation pass, validation fail visibility, recovery finalization, and provider/tool-block handling
- use `./scripts/validate-skill-routing.sh` for skill-routing changes
- use `./scripts/validate-harness-routing.sh` for executable harness-routing changes
- use `./scripts/collect-harness-tuning-data.sh` after harness-routing/core-workflow changes when you want a bounded thinking-first cost/performance tuning report from real validator timings
- use `./scripts/validate-team-activation.sh` for executable team-activation changes
- use `./scripts/validate-task-packets.sh` for executable task-packet changes
- use `./scripts/validate-handoffs.sh` for executable handoff changes
- use `./scripts/validate-same-runtime-bridge.sh` for same-runtime probe bridge changes

## Minimum completion evidence for this harness slice
A bounded change is not complete unless you can show:
- changed files
- validator or test evidence
- short explanation of what changed
- unresolved risks or caveats

For tasks completed through `task_update`, the current completion gate also expects:
- task status reaches `review` before `done`
- validation result is recorded as `pass` or explicit `overridden`
- docs/research tasks use the lighter allowed validation path rather than skipping proof
- manual overrides retain approval metadata in task state/evidence

## Recommended decision rule
### Use the script when:
- you want repeatable confidence
- you touched runtime logic
- you want a pass/fail artifact
- one live run is enough for the current proof target

### Use the runbook manually when:
- one validator check failed
- you want to isolate a single case
- you are debugging model behavior vs tool behavior

## Practical workflow example
### Example: editing `safe-bash.ts`
1. update the file
2. run:
   ```bash
   ./scripts/validate-phase-a-b.sh
   ```
3. inspect:
   - `reports/validation/...-script.md`
   - `reports/validation/...-script.json`
4. summarize evidence in current coding log
5. note any gaps instead of hiding them

## Current boundaries
This workflow currently validates only the implemented Phase A/B slice.
It does not validate future items like:
- a free-running queue daemon or scheduled autonomy loop beyond `run_next_queue_job`
- team dispatch beyond the current deterministic routing/packet/handoff surfaces
- UI widgets
- long-running autonomy beyond one bounded queue step

When those exist, they should add new validation scripts or extend the current validator in bounded ways.
