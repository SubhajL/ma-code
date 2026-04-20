# Pi Multi-Agent Harness Implementation Backlog

## What this file is

This is the **engineering backlog** version of the harness plan.

It turns the design into:
- task IDs
- priorities
- dependencies
- owner roles
- acceptance criteria
- estimated difficulty

This backlog is meant to help you actually build the harness in Pi.

---

# Priority legend

- **P0** = must do first
- **P1** = very important after P0
- **P2** = useful after core system works
- **P3** = polish / later improvements

# Difficulty legend

- **S** = small
- **M** = medium
- **L** = large
- **XL** = very large

# Owner legend

These are build owners, not runtime agent roles.

- **Human** = you / developer
- **Pi-Builder** = Pi session used to implement the harness
- **Reviewer** = human or model reviewing the implementation
- **Validator** = human or test workflow validating the implementation

---

# Phase A — Foundation hardening

## HARNESS-001 — Verify Pi runtime and provider access
- **Priority:** P0
- **Difficulty:** M
- **Owner:** Human
- **Depends on:** none

### Description
Verify that Pi is installed correctly and that your target providers and models are actually available in your environment.

### Tasks
- install Pi on macOS
- authenticate Anthropic
- authenticate OpenAI
- authenticate GitHub Copilot if you plan to use it
- open Pi and inspect the model selector
- confirm which exact model IDs are available
- confirm whether reasoning/thinking controls are exposed for each relevant path

### Acceptance criteria
- you can launch Pi successfully
- all intended providers can be authenticated
- all default role models can be selected
- all fallback models can be selected
- you have a written list of exact runnable model IDs

---

## HARNESS-002 — Finalize canonical project layout
- **Priority:** P0
- **Difficulty:** M
- **Owner:** Human
- **Depends on:** HARNESS-001

### Description
Choose the one final folder structure for the harness.

### Tasks
- decide what stays under project-local `.pi/`
- decide what stays outside `.pi/`
- decide where task state lives
- decide where queue state lives
- decide where logs live
- decide where reports live
- decide where worktrees live
- remove duplicate or confusing folders

### Acceptance criteria
- one canonical folder structure exists
- every folder has one clear purpose
- no duplicated state locations remain

---

## HARNESS-003 — Harden AGENTS.md into final operating contract
- **Priority:** P0
- **Difficulty:** M
- **Owner:** Pi-Builder
- **Depends on:** HARNESS-002

### Description
Turn AGENTS.md into the final repo-wide operating policy.

### Tasks
- refine branch rules
- define worktree rules
- define escalation rules
- define evidence rules
- define protected paths
- define blocked shell behavior at policy level
- define human approval rules

### Acceptance criteria
- AGENTS.md is concise and enforceable
- all major safety and workflow rules are present
- role prompts and extensions can rely on it without contradiction

---

## HARNESS-004 — Finalize exact model IDs and runtime mapping
- **Priority:** P0
- **Difficulty:** M
- **Owner:** Human
- **Depends on:** HARNESS-001

### Description
Replace human-readable model names with exact runnable IDs or verified aliases for your environment.

### Tasks
- map each role default to a real Pi-runnable model ID
- map each override to a real Pi-runnable model ID
- document which providers use API key vs subscription login
- document any Copilot-only naming differences

### Acceptance criteria
- `models.json` can be updated with runnable values
- no placeholder model names remain unresolved

---

# Phase B — Prompt and role completion

## HARNESS-005 — Finalize role prompts
- **Priority:** P0
- **Difficulty:** L
- **Owner:** Pi-Builder
- **Depends on:** HARNESS-003, HARNESS-004

### Description
Tighten each role prompt until boundaries are explicit.

### Scope
- orchestrator
- planning_lead
- build_lead
- quality_lead
- research_worker
- frontend_worker
- backend_worker
- infra_worker
- reviewer_worker
- validator_worker
- docs_worker
- recovery_worker

### Tasks
- clarify inputs
- clarify outputs
- clarify forbidden actions
- clarify escalation triggers
- clarify expected evidence

### Acceptance criteria
- every role has a sharply defined purpose
- workers do not overlap unnecessarily
- reviewer and validator are appropriately skeptical
- recovery is explicit about retry vs rollback vs stop

---

## HARNESS-006 — Define output contracts for every role
- **Priority:** P0
- **Difficulty:** M
- **Owner:** Pi-Builder
- **Depends on:** HARNESS-005

### Description
Every role must return predictable structured output.

### Tasks
- define standard markdown blocks for each role
- define worker task-packet format
- define validator decision format
- define recovery decision format
- define docs summary format

### Acceptance criteria
- orchestrator can route based on structured outputs
- output formats are simple and stable
- no role returns free-form chaos by default

---

## HARNESS-007 — Complete missing prompt templates
- **Priority:** P1
- **Difficulty:** M
- **Owner:** Pi-Builder
- **Depends on:** HARNESS-006

### Missing templates
- inspect-failure.md
- handoff-for-review.md
- handoff-for-validation.md
- request-retry.md

### Acceptance criteria
- every common human-triggered workflow has a template
- templates do not duplicate AGENTS.md or role logic
- templates are reusable and concise

---

# Phase C — State and schema

## HARNESS-008 — Finalize task schema semantics
- **Priority:** P0
- **Difficulty:** M
- **Owner:** Human + Pi-Builder
- **Depends on:** HARNESS-006

### Description
Schema exists; semantics do not.

### Tasks
- define required fields exactly
- define ownership rules
- define legal status transitions
- define evidence field structure
- define retry_count behavior
- define blocked-task notes structure

### Acceptance criteria
- task lifecycle can be implemented deterministically
- illegal transitions are clearly defined
- evidence requirements are machine-checkable enough for version 1

---

## HARNESS-009 — Finalize job queue semantics
- **Priority:** P1
- **Difficulty:** M
- **Owner:** Human + Pi-Builder
- **Depends on:** HARNESS-008

### Tasks
- define queue lifecycle
- define who can create jobs
- define priorities
- define dependencies
- define stop conditions
- define behavior for failed jobs

### Acceptance criteria
- orchestrator can pull jobs deterministically
- blocked and failed jobs are clearly distinguishable
- queue behavior is unambiguous

---

## HARNESS-010 — Define per-role memory structure
- **Priority:** P1
- **Difficulty:** M
- **Owner:** Pi-Builder
- **Depends on:** HARNESS-008

### Recommended memory holders
- orchestrator
- planning_lead
- frontend_worker
- backend_worker
- infra_worker
- recovery_worker

### Tasks
- define memory file names
- define update rules
- define summary vs discard policy
- define reset rules
- define memory size control rules

### Acceptance criteria
- memory is useful but compact
- no role accumulates uncontrolled junk state
- reset behavior is defined

---

# Phase D — Runtime extensions

## HARNESS-011 — Implement safe-bash.ts
- **Priority:** P0
- **Difficulty:** L
- **Owner:** Pi-Builder
- **Depends on:** HARNESS-003

### Description
First real runtime safety extension.

### Tasks
- classify command risks
- inspect bash tool calls before execution
- block clearly dangerous commands
- require confirmation for medium-risk commands
- support allowlists
- support path-based restrictions
- log blocked and warned actions

### Acceptance criteria
- destructive shell commands are blocked
- risky commands can require confirmation
- protected files/paths cannot be casually modified
- logs explain why actions were blocked

---

## HARNESS-012 — Test safe-bash.ts
- **Priority:** P0
- **Difficulty:** M
- **Owner:** Validator
- **Depends on:** HARNESS-011

### Test cases
- safe command allowed
- dangerous deletion blocked
- `.env` write blocked or warned
- destructive git action blocked
- protected branch edit blocked

### Acceptance criteria
- extension behaves correctly for expected safe and unsafe cases

---

## HARNESS-013 — Implement till-done.ts
- **Priority:** P0
- **Difficulty:** XL
- **Owner:** Pi-Builder
- **Depends on:** HARNESS-008, HARNESS-011

### Description
Task-discipline extension enforcing visible work ownership.

### Tasks
- require active task before mutating actions
- implement task create/claim/update path
- enforce legal status transitions
- require acceptance criteria before execution
- require evidence before completion
- block silent clearing
- surface blocked tasks
- support review/validation handoff
- log task lifecycle events

### Acceptance criteria
- no code mutation happens without visible task ownership
- no completion happens without evidence
- task state stays coherent throughout a run

---

## HARNESS-014 — Decide and implement task interaction method
- **Priority:** P0
- **Difficulty:** M
- **Owner:** Human + Pi-Builder
- **Depends on:** HARNESS-013

### Decision
Use:
- **tool-driven interaction**
- **file-backed persistence**

### Tasks
- define `task_update` tool contract
- define JSON persistence format
- define concurrency protection strategy
- define fallback maintenance path for manual repair

### Acceptance criteria
- agents use one normal path for task mutation
- direct raw JSON edits are not the normal path
- concurrent task corruption is mitigated

---

## HARNESS-015 — Implement audit logging extension or log subsystem
- **Priority:** P1
- **Difficulty:** M
- **Owner:** Pi-Builder
- **Depends on:** HARNESS-011, HARNESS-013

### Tasks
- log role name
- log provider/model
- log task id
- log file mutations
- log blocked actions
- log retries and escalations

### Acceptance criteria
- a run can be reconstructed after the fact
- log entries are compact and useful

---

## HARNESS-016 — Implement UI/status extension (minimal)
- **Priority:** P2
- **Difficulty:** L
- **Owner:** Pi-Builder
- **Depends on:** HARNESS-015

### Tasks
- current role display
- active task display
- current provider/model display
- blocked-action signal
- basic run health indicators

### Acceptance criteria
- operator can understand harness state without reading raw logs
- UI is informative, not noisy

---

# Phase E — Routing and model control

## HARNESS-017 — Convert routing matrix into executable logic
- **Priority:** P0
- **Difficulty:** L
- **Owner:** Pi-Builder
- **Depends on:** HARNESS-004, HARNESS-005

### Tasks
- decide where routing logic lives
- make routing deterministic
- define override rules in machine-readable form
- define fallback order
- define do-not-downgrade rules
- define budget-sensitive routing rules

### Acceptance criteria
- model selection is predictable
- critical roles are not casually downgraded
- routing is not ad hoc

---

## HARNESS-018 — Define provider failure handling
- **Priority:** P1
- **Difficulty:** M
- **Owner:** Pi-Builder
- **Depends on:** HARNESS-017

### Tasks
- detect provider/model failure
- define retry count per role
- define same-provider stronger-model retries
- define cross-provider retries
- define stop conditions
- define recovery-worker routing

### Acceptance criteria
- provider instability does not collapse the workflow
- failure handling is systematic

---

## HARNESS-019 — Finalize thinking-level policy
- **Priority:** P1
- **Difficulty:** M
- **Owner:** Human + Pi-Builder
- **Depends on:** HARNESS-004

### Tasks
- verify actual Pi runtime behavior for low/medium/high in your environment
- map labels to real runtime settings
- define when to lower thinking
- define when to raise thinking
- define who may change thinking level

### Acceptance criteria
- “low / medium / high” are operational, not decorative
- critical roles keep the right level of reasoning

---

# Phase F — Team orchestration

## HARNESS-020 — Implement team activation rules
- **Priority:** P0
- **Difficulty:** L
- **Owner:** Pi-Builder
- **Depends on:** HARNESS-005, HARNESS-017

### Tasks
- define when planning team is used
- define when build team is used
- define when quality team is used
- define when recovery team is used
- define overlap rules
- define whether quality waits on all builders

### Acceptance criteria
- orchestrator can route work without improvising
- team usage is deterministic

---

## HARNESS-021 — Implement task packet generation
- **Priority:** P0
- **Difficulty:** M
- **Owner:** Pi-Builder
- **Depends on:** HARNESS-006, HARNESS-020

### Tasks
- define task packet structure
- include scope
- include allowed files/domains
- include acceptance criteria
- include evidence expectations
- include escalation instructions
- include model override if needed

### Acceptance criteria
- workers can execute from packets without guesswork
- packet structure is stable and reusable

---

## HARNESS-022 — Implement handoff formats
- **Priority:** P1
- **Difficulty:** M
- **Owner:** Pi-Builder
- **Depends on:** HARNESS-021

### Handoffs
- build lead → worker
- worker → quality lead
- quality lead → reviewer
- quality lead → validator
- recovery → orchestrator or lead

### Acceptance criteria
- multi-step workflows stay structured
- no free-form handoff chaos

---

# Phase G — Repo isolation

## HARNESS-023 — Define worktree policy
- **Priority:** P0
- **Difficulty:** M
- **Owner:** Human
- **Depends on:** HARNESS-003

### Tasks
- define naming convention
- define when one worker gets one worktree
- define when sharing is allowed
- define branch naming rules
- define cleanup rules

### Acceptance criteria
- workers do not stomp on each other’s changes
- branch/worktree naming is predictable

---

## HARNESS-024 — Build worktree helper scripts
- **Priority:** P1
- **Difficulty:** M
- **Owner:** Pi-Builder
- **Depends on:** HARNESS-023, HARNESS-032

### Status note
- deferred until after the single-runner HARNESS-032 path is implemented and validated
- if near-term work explicitly requires parallel queue lanes, re-open this item earlier with that narrower scope called out

### Scripts
- create worktree
- cleanup worktree
- branch naming helper
- status inspector
- merge/review prep helper

### Acceptance criteria
- worktree operations are easy and repeatable
- humans and agents do not need to improvise them
- implementation starts only after the single-runner-first queue path exists, unless parallel queue lanes become near-term work

---

## HARNESS-025 — Protect main branch
- **Priority:** P0
- **Difficulty:** M
- **Owner:** Human + Pi-Builder
- **Depends on:** HARNESS-011, HARNESS-023

### Tasks
- block direct main edits in policy
- block destructive git actions in safe-bash
- require completion gates before merge-ready status

### Acceptance criteria
- main branch cannot be casually damaged

---

# Phase H — Validation and recovery

## HARNESS-026 — Define validation tiers
- **Priority:** P1
- **Difficulty:** M
- **Owner:** Human + Pi-Builder
- **Depends on:** HARNESS-008

### Tiers
- lightweight
- standard
- strict

### Acceptance criteria
- validation intensity is proportional to task risk

---

## HARNESS-027 — Implement validation checklist logic
- **Priority:** P1
- **Difficulty:** M
- **Owner:** Pi-Builder
- **Depends on:** HARNESS-026

### Tasks
- define acceptance checks
- define test expectations
- define diff review expectations
- define evidence expectations by task class
- define pass/fail/block outputs

### Acceptance criteria
- validator behavior is predictable
- pass/fail rules are consistent

---

## HARNESS-028 — Connect validator to completion gates
- **Priority:** P0
- **Difficulty:** M
- **Owner:** Pi-Builder
- **Depends on:** HARNESS-027, HARNESS-013

### Tasks
- require validation before completion
- define exceptions for research/docs-only tasks
- define manual override path
- define rejection flow

### Acceptance criteria
- completion is based on proof, not optimism

---

## HARNESS-029 — Define failure taxonomy
- **Priority:** P1
- **Difficulty:** M
- **Owner:** Pi-Builder
- **Depends on:** HARNESS-013

### Failure classes
- plan failure
- model failure
- tool failure
- repo-state failure
- validation failure
- ambiguity failure

### Acceptance criteria
- recovery worker has known failure categories to reason from

---

## HARNESS-030 — Implement retry logic
- **Priority:** P1
- **Difficulty:** M
- **Owner:** Pi-Builder
- **Depends on:** HARNESS-018, HARNESS-029

### Tasks
- define retry limits per role
- define retry limits per provider
- define same-role retry rules
- define stronger-model retry rules
- define provider-switch rules
- define forbidden retry situations

### Acceptance criteria
- the system does not loop stupidly
- retries are explainable

---

## HARNESS-031 — Define rollback policy
- **Priority:** P1
- **Difficulty:** M
- **Owner:** Human + Pi-Builder
- **Depends on:** HARNESS-029

### Tasks
- define when rollback beats retry
- define what evidence triggers rollback
- define rollback scope
- define who approves rollback

### Acceptance criteria
- recovery can choose rollback without ambiguity

---

# Phase I — Long-running autonomy

## HARNESS-032 — Implement bounded queue execution
- **Priority:** P1
- **Difficulty:** L
- **Owner:** Pi-Builder
- **Depends on:** HARNESS-009, HARNESS-020, HARNESS-021

### Tasks
- create live queue file or service
- have orchestrator pull next job
- start with one bounded job at a time
- record job start and finish
- record failures and blockers
- define blocked vs failed queue behavior

### Acceptance criteria
- harness can process a queue safely
- jobs do not drift endlessly

---

## HARNESS-033 — Define scheduled workflows
- **Priority:** P2
- **Difficulty:** M
- **Owner:** Human + Pi-Builder
- **Depends on:** HARNESS-032

### Candidate workflows
- daily review queue
- nightly docs cleanup
- repo audit runs
- test triage jobs
- backlog summarization

### Acceptance criteria
- recurring work items are well defined and bounded

---

## HARNESS-034 — Add stop conditions
- **Priority:** P0
- **Difficulty:** M
- **Owner:** Pi-Builder
- **Depends on:** HARNESS-032

### Stop conditions
- max retries
- max cost
- max runtime
- max unresolved blockers
- max failed validations

### Acceptance criteria
- long-running autonomy does not become endless drift

---

# Phase J — Operator usability and testing

## HARNESS-035 — Define human control points
- **Priority:** P1
- **Difficulty:** M
- **Owner:** Human
- **Depends on:** HARNESS-032

### Tasks
- choose when approval is required
- choose when autonomy is allowed
- define pause/resume
- define inspection commands

### Acceptance criteria
- operator knows where control stays human

---

## HARNESS-036 — Define daily operating workflow
- **Priority:** P1
- **Difficulty:** S
- **Owner:** Human
- **Depends on:** HARNESS-035

### Tasks
- how to start
- how to queue work
- how to inspect state
- how to approve risky actions
- how to stop safely
- how to resume

### Acceptance criteria
- running the harness feels like operating a tool, not a research experiment

---

## HARNESS-037 — Unit-test the extensions
- **Priority:** P0
- **Difficulty:** M
- **Owner:** Validator
- **Depends on:** HARNESS-011, HARNESS-013

### Acceptance criteria
- safe-bash and till-done behave correctly under expected and dangerous conditions

---

## HARNESS-038 — Integration-test core workflows
- **Priority:** P0
- **Difficulty:** L
- **Owner:** Validator
- **Depends on:** HARNESS-028, HARNESS-032

### Test scenarios
- simple docs-only job
- frontend-only job
- backend-only job
- mixed frontend/backend job
- failed validation
- recovery scenario
- provider failure scenario

### Acceptance criteria
- harness survives real flows end to end

---

## HARNESS-039 — Cost/performance tuning
- **Priority:** P2
- **Difficulty:** M
- **Owner:** Human + Pi-Builder
- **Depends on:** HARNESS-038

### Tasks
- measure expensive roles
- measure cheap roles
- track escalation frequency
- track unnecessary retries
- tune routing matrix

### Acceptance criteria
- harness is economically sane

---

# Phase K — Packaging and docs

## HARNESS-040 — Convert harness into reusable Pi package
- **Priority:** P2
- **Difficulty:** L
- **Owner:** Pi-Builder
- **Depends on:** HARNESS-038

### Tasks
- package prompts
- package skills
- package extensions
- package optional themes/widgets
- add install instructions
- add versioning

### Acceptance criteria
- harness can be moved between projects cleanly

---

## HARNESS-041 — Create operator documentation
- **Priority:** P1
- **Difficulty:** M
- **Owner:** Human + Pi-Builder
- **Depends on:** HARNESS-040

### Docs
- install guide
- provider setup guide
- model routing guide
- role guide
- troubleshooting guide
- safety rules
- extension explanation

### Acceptance criteria
- another person could operate the harness

---

# Recommended next move

Start with this exact order:

1. HARNESS-001
2. HARNESS-002
3. HARNESS-003
4. HARNESS-004
5. HARNESS-005
6. HARNESS-006
7. HARNESS-011
8. HARNESS-012
9. HARNESS-013
10. HARNESS-014

That is the shortest path from “starter pack” to “real system foundation.”

---

# Repo-local structure update

The harness is now reorganized so that:

- `AGENTS.md` and `SYSTEM.md` stay at the repo root
- all other Pi-specific harness assets live under `.pi/agent/`

That means:
- routing docs moved under `.pi/agent/routing/`
- team YAML moved under `.pi/agent/teams/`
- harness docs moved under `.pi/agent/docs/`
- schemas moved under `.pi/agent/state/schemas/`
- runtime-state placeholders moved under `.pi/agent/state/runtime/`

This is the preferred layout when each repo should contain the Pi harness assets it uses.
