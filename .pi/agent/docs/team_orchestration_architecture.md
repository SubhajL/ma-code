# Team Orchestration Architecture

This document defines the intended architecture for Phase F team orchestration.
It explains how the orchestrator should activate teams, how work should be packaged, and how handoffs should remain structured instead of free-form.

## Purpose
Team orchestration exists to make the harness behave like a real multi-agent system.
Its goals are:
- deterministic team selection
- bounded task packets
- structured handoffs
- clear role boundaries
- predictable completion routing

This architecture is about coordination.
It is not a claim that long-running autonomy or full queue execution is already implemented.

## Scope
This document defines:
- team roles and responsibilities
- when each team should be activated
- overlap and sequencing rules
- task packet structure
- handoff formats
- completion and escalation flow

It does not define:
- queue runner implementation
- worktree creation mechanics
- UI control surface
- provider-specific runtime code

## Team model
Current teams:
- `planning`
- `build`
- `quality`
- `recovery`

Current definitions live under:
- `.pi/agent/teams/planning.yaml`
- `.pi/agent/teams/build.yaml`
- `.pi/agent/teams/quality.yaml`
- `.pi/agent/teams/recovery.yaml`

## Core orchestration principles
- the orchestrator routes; it does not become the default coder
- teams are selected by job type and state, not by improvisation
- provider/model lane selection should use executable routing policy rather than ad hoc switching
- workers should receive bounded packets with explicit file/domain limits
- quality and recovery are first-class lanes, not afterthoughts
- evidence gates remain mandatory
- escalation beats silent scope growth

## Team responsibilities

### Planning team
Definition:
- lead: `planning_lead`
- workers: `research_worker`, `docs_worker`

Use when:
- requirements are unclear
- repo discovery is needed
- a feature needs planning before implementation
- a human asks for design or docs before code

Should usually produce:
- clarified goal
- assumptions
- cross-model planning status when relevant
- file map
- bounded implementation plan
- acceptance criteria
- validation ideas

Should not normally:
- mutate application code
- absorb build-team work

### Build team
Definition:
- lead: `build_lead`
- workers: `frontend_worker`, `backend_worker`, `infra_worker`

Use when:
- implementation work is approved and scoped
- code or config changes are needed
- work can be split by domain

Should usually produce:
- worker assignments
- scoped changes
- implementation evidence
- escalation when blocked or overlapping

Should not normally:
- redefine acceptance criteria on the fly
- skip quality routing after implementation

### Quality team
Definition:
- lead: `quality_lead`
- workers: `reviewer_worker`, `validator_worker`, `docs_worker`

Use when:
- implementation output needs review
- validation evidence is required before completion
- docs or changelog updates are needed as part of completion packaging

Should usually produce:
- review scope
- validation scope
- pass/fail/block outcome
- evidence gap summary

Should not normally:
- trust worker self-reports without proof
- treat compilation alone as acceptance

### Recovery team
Definition:
- lead reference currently points to `quality_lead`
- worker: `recovery_worker`

Use when:
- evidence is contradictory
- validation failed
- retries need a structured decision
- rollback or stop decisions are needed

Should usually produce:
- failure summary
- likely cause analysis
- retry/rollback/escalation recommendation

Should not normally:
- loop retries without limits
- hide failure by rerouting silently

## Current executable routing surface
For the current repo-local slice, executable model/provider routing now lives at:
- `.pi/agent/extensions/harness-routing.ts`
- tool: `resolve_harness_route`
- policy source: `.pi/agent/models.json`

This remains the provider/model lane resolver used by the orchestrator and later orchestration layers.

## Current executable team activation surface
For the current repo-local slice, executable team activation now lives at:
- `.pi/agent/extensions/team-activation.ts`
- tool: `resolve_team_activation`
- activation policy source: `.pi/agent/teams/activation-policy.json`
- team membership source: `.pi/agent/teams/*.yaml`

It gives the orchestrator a deterministic activation/sequence/overlap surface without yet implying full multi-agent dispatch.

## Current executable task packet surface
For the current repo-local slice, executable task packet generation now lives at:
- `.pi/agent/extensions/task-packets.ts`
- tool: `generate_task_packet`
- packet policy source: `.pi/agent/packets/packet-policy.json`
- packet schema source: `.pi/agent/state/schemas/task-packet.schema.json`

It gives the orchestrator and build lead a deterministic packet-generation surface.

## Current executable handoff surface
For the current repo-local slice, executable handoff generation now lives at:
- `.pi/agent/extensions/handoffs.ts`
- tool: `generate_handoff`
- handoff policy source: `.pi/agent/handoffs/handoff-policy.json`
- handoff schema source: `.pi/agent/state/schemas/handoff.schema.json`

This is intentionally narrower than queue-driven orchestration runtime.
It gives build, quality, and recovery lanes deterministic handoff generation without yet implying worker dispatch or queue automation.

## Current executable recovery decision surface
For the current repo-local slice, executable recovery decisioning now lives at:
- policy tool: `.pi/agent/extensions/recovery-policy.ts` via `resolve_recovery_policy`
- runtime decision tool: `.pi/agent/extensions/recovery-runtime.ts` via `resolve_recovery_runtime_decision`
- policy source: `.pi/agent/recovery/recovery-policy.json`
- validators: `scripts/validate-recovery-policy.sh`, `scripts/validate-recovery-runtime.sh`

It gives recovery and orchestration layers one bounded decision surface for retry, stronger-model retry, provider switch, rollback recommendation, stop, or escalation recommendations using existing validation/failure evidence alongside bounded queue execution.

## Current bounded queue-runner surface
For the current repo-local slice, bounded single-step queue advancement now lives at:
- `.pi/agent/extensions/queue-runner.ts`
- public tool: `run_next_queue_job`
- compatibility alias: `run_queue_once`
- validator: `scripts/validate-queue-runner.sh`

Its behavior is intentionally narrow:
- finalize one existing `running` job only when its linked task is terminal
- otherwise start at most one eligible queued job
- reuse executable team activation, task packets, optional initial handoff generation, and existing `till-done` task semantics
- enforce the currently supported HARNESS-034 controls directly: `budget.maxRetries`, `budget.maxRuntimeMinutes`, `budget.maxFailedValidations`, and the approval boundary (`approvalRequired=true` / `approval_boundary_hit`)
- block unsupported controls explicitly, including `budget.maxCostUsd`, `budget.maxFilesChanged`, and unsupported free-form `stop_conditions`
- log queue-runner decisions to `logs/harness-actions.jsonl`
- it is not full team dispatch or a daemon

## Team activation rules

### Rule 1: start with planning when uncertainty is material
Choose `planning` first when:
- requirements are ambiguous
- repo impact is unclear
- more than one domain may change
- acceptance criteria are not yet explicit
- a human asked for design before implementation

### Rule 2: start with build only when execution is already bounded
Choose `build` first when:
- the work is implementation-ready
- scope is explicit
- target files/domains are known
- acceptance criteria already exist

### Rule 3: quality follows build before completion
Choose `quality` after build when:
- code or config changed
- validation evidence is needed
- reviewer/validator proof is required before completion

For docs-only or research-only work, quality may be lighter, but evidence still matters.

### Rule 4: recovery is triggered by failure, contradiction, or repeated blockage
Choose `recovery` when:
- validation returns fail or blocked with contradictions
- the same task is blocked twice
- retries need structured decision-making
- repo/provider/tool conditions undermine normal flow

## Team sequencing rules
Preferred high-level flow:

1. orchestrator receives goal or job
2. planning team clarifies when needed
3. build team executes when scope is ready
4. quality team reviews and validates
5. recovery team intervenes when failure or contradiction appears
6. orchestrator decides complete, retry, reroute, block, or escalate

Not every job needs every team.
But the orchestrator should make those skips explicit.

## Overlap rules

### Planning and build
Allowed overlap:
- minimal overlap only when planning output is stable enough for a bounded first implementation slice

Default rule:
- planning should finish a usable packet before build starts

### Multiple build workers
Allowed when:
- file/domain boundaries are clearly non-overlapping, or
- explicit worktree isolation exists

Not allowed when:
- two workers would likely touch the same files without approved shared ownership
- requirements are still moving

### Quality vs build
Default rule:
- quality should evaluate outputs after a bounded implementation packet completes

Exception:
- quality may review an intermediate packet if the build lead asks for an early checkpoint

### Recovery vs others
Recovery should usually not run in parallel with active retry implementation on the same task.
It should decide first whether to:
- retry
- reroute
- rollback
- stop
- escalate

## Task packet architecture
A task packet is the bounded assignment unit passed between orchestration layers.
It should let a worker act without guesswork.

### Required packet contents
Each packet should include:
- packet ID
- source goal or job ID
- assigned role or team
- task title
- explicit goal statement
- explicit non-goals, or a bounded "do not widen scope" default when no custom non-goals were provided
- scope
- discovery path or inspected-context summary when planning/research informed the packet
- cross-model planning note when a second planning pass influenced the packet
- files to inspect
- files expected to be modified, or explicit `none` when the packet is inspect-only
- allowed files or domains
- disallowed files or domains when relevant
- acceptance criteria
- evidence expectations
- validation expectations
- expected proof artifacts or command results
- wiring or registration checks when new runtime components are involved
- migration-path note when the packet touches an architectural boundary or explicitly says that no migration is needed
- escalation instructions
- dependencies
- model override if needed

### Packet quality rule
A packet is valid only if it is executable without hidden assumptions.
If a worker must infer the real objective, the packet is not good enough.

### Current executable packet contract
The current repo-local executable packet contract is enforced by:
- `.pi/agent/extensions/task-packets.ts`
- `.pi/agent/packets/packet-policy.json`
- `.pi/agent/state/schemas/task-packet.schema.json`
- `scripts/validate-task-packets.sh`

The generator validates:
- assigned role/team alignment
- presence of scope boundaries via allowed paths or domains
- explicit goal/non-goal/file-plan/proof fields
- required acceptance/evidence/escalation sections
- required migration-path note
- build-packet modify lists for packets expected to make changes
- optional model override attachment through executable routing policy when needed

### Recommended packet template
```md
## Packet ID
- packet-build-001

## Source
- job: harness-020
- parent task: task-123

## Assigned Role
- backend_worker

## Task
- Define task update transition checks

## Goal
- tighten task-state transition enforcement without changing unrelated queue behavior

## Scope
- implement only transition logic for task states

## Non-Goals
- do not redesign task storage
- do not change queue-runner behavior in this packet

## Discovery Path
- Auggie-first if available; otherwise inspect task schema files directly

## Cross-Model Planning
- second model not needed for this packet

## Files to Inspect
- .pi/agent/extensions/till-done.ts
- .pi/agent/docs/task_schema_semantics.md

## Files to Modify
- .pi/agent/extensions/till-done.ts
- .pi/agent/docs/task_schema_semantics.md

## Allowed Files
- .pi/agent/extensions/till-done.ts
- .pi/agent/docs/task_schema_semantics.md

## Disallowed Files
- .env*
- .git/
- deployment config

## Acceptance Criteria
- transition checks are documented and implemented consistently
- illegal done-without-evidence path is blocked

## Evidence Expectations
- changed files listed
- validation output or report path
- short note of known gaps

## Validation Expectations
- validator checks transition behavior
- run smallest relevant command path before handoff

## Expected Proof
- focused validator or unit-test output proves illegal done-without-evidence is blocked
- changed files and known gaps are recorded before handoff

## Wiring Checks
- verify the transition logic is actually reached from the task update path

## Migration Path Note
- not applicable; this packet tightens an existing path in place

## Escalation Instructions
- escalate if queue semantics are required to proceed
- escalate if the file plan or expected proof becomes unclear before mutation

## Model Override
- none
```

## Handoff architecture
Handoffs should be structured and role-specific.
They should not be casual summaries that lose constraints.

### Build lead -> worker handoff
Must include:
- worker assignment
- explicit goal and non-goals inside the bounded scope summary
- scope boundaries
- discovery path or inspected-context summary when relevant
- files to inspect and files to modify when known
- allowed files/domains
- acceptance criteria
- evidence expectations and expected proof
- wiring or registration checks when relevant
- migration-path note when relevant
- escalation triggers

### Worker -> quality lead handoff
Must include:
- what changed
- what did not change
- evidence produced
- validation commands run when relevant
- wiring verification summary when relevant
- known gaps
- blockers encountered

### Quality lead -> reviewer handoff
Must include:
- review scope
- claimed completion status
- files to inspect
- specific risks to challenge
- request for severity-ordered findings and concrete file references where possible

### Quality lead -> validator handoff
Must include:
- acceptance criteria to check
- validation path to run or inspect
- expected proof artifacts
- exact open questions

### Recovery -> orchestrator or lead handoff
Must include:
- failure type
- likely cause
- retry options
- recommended action
- stop/escalation threshold if applicable

## Current executable handoff contract
The current repo-local executable handoff contract is enforced by:
- `.pi/agent/extensions/handoffs.ts`
- `.pi/agent/handoffs/handoff-policy.json`
- `.pi/agent/state/schemas/handoff.schema.json`
- `scripts/validate-handoffs.sh`

The generator validates:
- role-pair correctness for each supported handoff type
- preservation of packet scope, acceptance, evidence expectations, and escalation instructions
- role-specific required sections before a handoff is emitted

## Recommended handoff templates

### Worker -> quality lead
```md
## Work Summary
- changed files: ...
- unchanged but inspected: ...

## Acceptance Coverage
- criterion 1: met / partial / not met
- criterion 2: met / partial / not met

## Evidence
- report path: ...
- command output summary: ...

## Known Gaps
- ...

## Blockers
- none
```

### Quality lead -> validator
```md
## Validation Scope
- validate acceptance criteria for packet-build-001

## Files
- ...

## Expected Proof
- validator report
- exact block reason if rejected

## Risks
- overlap with task schema semantics
```

## Completion decision flow
The orchestrator should not mark completion on implementation narration alone.
A normal completion path is:
- build output exists
- quality routes review/validation
- evidence is examined
- acceptance criteria are checked
- orchestrator issues final completion decision

Recommended orchestrator decisions:
- `route`
- `blocked`
- `retry`
- `escalate`
- `complete`

## Escalation rules
Escalate when:
- task packet is unclear
- two workers would collide
- evidence is weak or contradictory
- provider/runtime behavior is unreliable
- scope expands beyond the packet
- a protected path or human approval boundary is hit

## Determinism rules
To keep orchestration predictable:
- team selection should follow explicit activation rules
- packets should use stable section headers
- handoffs should preserve scope and evidence expectations
- retries should go through recovery logic, not ad hoc reassignment
- completion should remain evidence-gated

## Boundaries with other phases
This architecture depends on but does not replace:
- task and queue semantics from Phase C
- runtime enforcement from Phase D
- routing logic from Phase E
- worktree isolation from Phase G
- validation/recovery policy from Phase H

It should therefore be implemented in a bounded way.
Do not imply queue-driven autonomy from this document alone.

## Future evolution notes
Likely later additions:
- explicit packet schema in JSON or markdown-contract form
- team-level retry metadata
- worktree references per packet
- queue-job linkage
- richer orchestration telemetry

Those should preserve the core principles here:
- deterministic routing
- bounded packets
- structured handoffs
- evidence-gated completion
