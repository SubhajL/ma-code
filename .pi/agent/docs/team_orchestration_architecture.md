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

This is intentionally narrower than HARNESS-021 task packet generation or a queue-driven orchestration runtime.
It gives the orchestrator a deterministic activation/sequence/overlap surface without yet implying full multi-agent dispatch.

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
- scope
- discovery path or inspected-context summary when planning/research informed the packet
- cross-model planning note when a second planning pass influenced the packet
- allowed files or domains
- disallowed files or domains when relevant
- acceptance criteria
- evidence expectations
- validation expectations
- wiring or registration checks when new runtime components are involved
- escalation instructions
- dependencies
- model override if needed

### Packet quality rule
A packet is valid only if it is executable without hidden assumptions.
If a worker must infer the real objective, the packet is not good enough.

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

## Scope
- implement only transition logic for task states

## Discovery Path
- Auggie-first if available; otherwise inspect task schema files directly

## Cross-Model Planning
- second model not needed for this packet

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

## Wiring Checks
- verify the transition logic is actually reached from the task update path

## Escalation Instructions
- escalate if queue semantics are required to proceed

## Model Override
- none
```

## Handoff architecture
Handoffs should be structured and role-specific.
They should not be casual summaries that lose constraints.

### Build lead -> worker handoff
Must include:
- worker assignment
- scope boundaries
- discovery path or inspected-context summary when relevant
- allowed files/domains
- acceptance criteria
- evidence expectations
- wiring or registration checks when relevant
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
