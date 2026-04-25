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

## HARNESS-044 — Tighten task-packet planning completeness
- **Priority:** P1
- **Difficulty:** M
- **Owner:** Pi-Builder
- **Depends on:** HARNESS-006, HARNESS-032

### Description
Push more planning quality into task packets so downstream workers do not have to infer the real objective from thin summaries.

### Tasks
- identify which planning-derived fields should be explicit in packets
- distinguish files to inspect from files to modify when relevant
- tighten packet expectations for validation ideas
- tighten packet expectations for wiring or registration checks
- add non-goals or scope-boundary expectations when relevant
- add migration-path note expectations when large architectural changes are proposed
- update packet docs/policy/validator wiring as needed

### Acceptance criteria
- task packets preserve enough planning context that workers do not have to guess the real objective
- packet expectations for validation and wiring checks are more explicit
- packet docs and validator wiring match the stronger completeness rules
- packet structure remains bounded and readable rather than turning into free-form essays

---

## HARNESS-045 — Tighten handoff completeness from planning and quality structure
- **Priority:** P1
- **Difficulty:** M
- **Owner:** Pi-Builder
- **Depends on:** HARNESS-044

### Description
Ensure handoffs preserve the stronger planning and quality expectations instead of dropping critical context between roles.

### Tasks
- tighten build-to-worker handoff expectations for discovery summary, scope boundaries, evidence expectations, and wiring checks
- tighten quality-to-review handoff expectations for risks to challenge and file references
- tighten quality-to-validation handoff expectations for exact proof path and open validation questions
- tighten recovery escalation handoffs when migration-path or tactical-vs-strategic distinctions matter
- update handoff docs/templates/validation wiring as needed

### Acceptance criteria
- handoffs preserve the critical planning and quality context needed by the next role
- review and validation handoffs become more actionable and less guess-driven
- handoff docs/templates stay aligned with executable handoff expectations
- validator or static wiring proof catches obvious completeness drift

---

## HARNESS-048 — Refine bounded orchestration/runtime flow using stronger structures
- **Priority:** P1
- **Difficulty:** L
- **Owner:** Pi-Builder
- **Depends on:** HARNESS-044, HARNESS-045, HARNESS-047

### Description
Use the improved packet, handoff, and review/validation structures to make bounded orchestration more deterministic and easier to operate.

### Tasks
- identify the smallest meaningful orchestration/runtime refinements enabled by stronger packets and quality outputs
- improve bounded role transitions where current flow still feels ad hoc
- improve queue-to-quality or quality-to-next-step linkage where structured outputs now allow it
- keep changes explicitly bounded and reviewable
- add focused integration proof for the refined flow

### Acceptance criteria
- at least one meaningful bounded orchestration flow becomes more deterministic and easier to reason about
- the refinement uses stronger packet/handoff/review structures rather than bypassing them
- no hidden daemon or uncontrolled autonomy is introduced
- integration proof demonstrates the refined bounded behavior

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

## HARNESS-047 — Normalize reviewer and validator output structure
- **Priority:** P1
- **Difficulty:** M
- **Owner:** Pi-Builder + Validator
- **Depends on:** HARNESS-043, HARNESS-046

### Description
Make reviewer and validator outputs more machine-checkable without turning them into unreadable bureaucracy.

### Tasks
- decide which review fields should become normalized
- decide which validator fields should become normalized
- define stable severity expectations for reviewer findings
- define stable missing-proof and final-decision expectations for validator outputs
- update relevant role prompts, templates, docs, and light validation checks
- keep the structure easy for humans to read and easy for future tooling to consume

### Acceptance criteria
- reviewer outputs have clearer normalized structure for severity, required fixes, and optional improvements
- validator outputs have clearer normalized structure for proof status, missing proof, and final decision
- prompts/templates/docs remain aligned
- validation or static checks can catch obvious drift in the normalized structure

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

## HARNESS-049 — Add expanded safe stop and budget controls
- **Priority:** P2
- **Difficulty:** L
- **Owner:** Pi-Builder
- **Depends on:** HARNESS-042, HARNESS-048

### Description
Expand bounded autonomy stop controls carefully so longer-running bounded work becomes more trustworthy without pretending unsupported controls are implemented.

### Tasks
- identify the next safest structured stop/budget controls to implement
- prefer controls that can be enforced deterministically from visible runtime state
- add explicit enforcement for selected new controls
- keep unsupported controls visibly blocked instead of silently ignored
- update queue docs/schema/runtime validation as needed
- add focused negative-path and non-trigger coverage

### Candidate controls
- max unresolved blockers
- structured stop-condition enums beyond the current limited set
- max files changed if it can be measured deterministically
- stronger failed-run or failure-counter accounting

### Acceptance criteria
- newly supported controls are actually enforced in runtime behavior
- unsupported controls remain blocked clearly
- queue/session validators cover new stop-condition paths and non-trigger behavior
- docs accurately distinguish supported controls from unsupported ones

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

## HARNESS-042 — Expand multi-step queue/session validation scenarios
- **Priority:** P0
- **Difficulty:** M
- **Owner:** Validator
- **Depends on:** HARNESS-032, HARNESS-033, HARNESS-038

### Description
Strengthen regression confidence in bounded queue execution and bounded queue sessions through harder multi-step test scenarios.

### Tasks
- add queue/session scenarios with multiple finalize/start transitions
- add blocked and failed visibility scenarios across bounded session runs
- add paused-queue boundary scenarios for bounded sessions
- add recovery-action visibility checks in triage summaries
- add scheduled-workflow-created job scenarios flowing through bounded sessions
- add edge cases for `maxSteps` and `maxRuntimeSeconds`

### Acceptance criteria
- queue/session validation covers several meaningful multi-step flows beyond the current baseline
- regressions in stop reasons, triage summaries, and next-action recommendations are easier to catch
- validator output clearly shows the stronger scenarios were exercised

---

## HARNESS-043 — Add executable prompt/template contract validation
- **Priority:** P0
- **Difficulty:** M
- **Owner:** Validator
- **Depends on:** HARNESS-005, HARNESS-006, HARNESS-007, HARNESS-041

### Description
Move prompt/template proof beyond substring checks toward stronger contract validation for repo-local role and template surfaces.

### Tasks
- validate required section headers for role prompts
- validate required section headers for templates
- validate required decision lines where applicable
- validate architecture-review workflow references where expected
- consider prompt conformance linting for exact required top-level structure
- wire the checks into static validation and CI

### Acceptance criteria
- a dedicated or clearly structured validation path exists for role/template contract shape
- failures identify the exact prompt/template that violated contract
- CI runs the check
- current repo-local prompt/template inventory passes

---

## HARNESS-046 — Add architecture and drift review artifacts
- **Priority:** P1
- **Difficulty:** S
- **Owner:** Pi-Builder + Docs
- **Depends on:** HARNESS-043

### Description
Turn the architecture-review workflow into reusable artifacts so architecture and drift reviews become more consistent and less hand-wavy.

### Tasks
- add an architecture review request template
- add a capability/drift assessment template
- add a migration-path proposal template for larger architectural changes
- update docs so operators and reviewers know when to use each artifact
- add static validation for presence and basic wiring when appropriate

### Acceptance criteria
- architecture and drift review work has concrete reusable artifacts rather than only prose guidance
- docs clearly point to the new artifacts
- architecture-review outputs become more repeatable and bounded
- validation or static wiring proof confirms the artifacts are present

---

## HARNESS-050 — Operator and report polish last
- **Priority:** P3
- **Difficulty:** S
- **Owner:** Pi-Builder + Docs
- **Depends on:** HARNESS-048, HARNESS-049

### Description
Improve operator ergonomics and report clarity after core proof, structure, and bounded runtime behavior are stronger.

### Tasks
- improve CLI summary readability where it helps daily operation
- improve report formatting and drill-down guidance
- improve operator-facing wording around review, validation, and bounded autonomy state
- keep UI work lightweight and subordinate to runtime maturity

### Acceptance criteria
- operator-facing summaries and reports become easier to scan and use
- no UI or presentation work outruns runtime maturity
- docs and operator surfaces remain aligned with actual implemented capability

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

# Backlog sequencing note
For the next slice of work, prefer this execution order even though items are stored under different phases:

1. HARNESS-042
2. HARNESS-043
3. HARNESS-044
4. HARNESS-045
5. HARNESS-046
6. HARNESS-047
7. HARNESS-048
8. HARNESS-049
9. HARNESS-050

Store by phase, execute by dependency order.

---

# Recommended next move

For the current repo-local harness state, start with this exact order:

1. HARNESS-042
2. HARNESS-043
3. HARNESS-044
4. HARNESS-045
5. HARNESS-046
6. HARNESS-047
7. HARNESS-048
8. HARNESS-049
9. HARNESS-050

That is the shortest path from the current bounded harness slice to stronger proof, planning/packet completeness, review structure, bounded orchestration maturity, and later operator polish.

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
