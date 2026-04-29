# Validation and Recovery Architecture

This document defines the intended Phase H architecture for validation and recovery.
It extends the existing validation foundation into a fuller completion-gate and failure-handling model.

Primary related references:
- `.pi/agent/docs/validation_architecture.md`
- `.pi/agent/docs/runtime_validation_runbook.md`
- `.pi/agent/docs/operator_workflow.md`
- `AGENTS.md`

## Purpose
Validation and recovery exist to answer two questions safely:
- should this work be accepted?
- if not, what should happen next?

The system should not rely on worker optimism.
It should rely on:
- explicit validation tiers
- predictable pass/fail/block decisions
- proof-based completion gates
- structured failure taxonomy
- bounded retry and rollback decisions

## Scope
This document defines:
- validation tiers
- validation checklist logic
- completion-gate rules
- failure classes
- retry rules
- rollback policy
- recovery decision flow

It does not define:
- every concrete validator script
- UI presentation
- queue daemon code
- provider SDK internals

## Layer relationship
This document builds on the existing validation architecture.
Use the broader validation doc for:
- validation layers
- report conventions
- current validator assets

Use this document for:
- how validation should scale beyond Phase A/B
- how failures should be classified
- how the harness should decide retry, rollback, or stop

## Validation roles

### Quality lead
Responsible for:
- deciding review scope
- deciding validation scope
- rejecting shallow completion claims
- routing work to reviewer and validator

### Reviewer worker
Responsible for:
- human-style critical inspection of changed output
- spotting logic, scope, or quality problems not captured by a simple test pass
- ordering meaningful findings by severity
- citing exact files or lines when possible
- naming tests or validation still needed when that would reduce ambiguity

### Validator worker
Responsible for:
- checking acceptance criteria against evidence
- using Auggie-first discovery when available and falling back immediately to local inspection when it is not
- running or inspecting validation commands
- preferring the smallest relevant command path that can prove or disprove the claim
- issuing `pass`, `fail`, or `blocked`

### Recovery worker
Responsible for:
- analyzing failure cause
- recommending retry, stronger model, provider switch, rollback, stop, or escalation

## Validation tiers
Validation intensity should match task risk.

### Tier 1 — Lightweight
Use for:
- docs-only work
- research-only work
- low-risk prompt or note changes

Typical checks:
- changed files exist
- content matches acceptance criteria
- no scope widening
- known gaps are visible

Typical evidence:
- file paths
- readback verification
- reviewer inspection

### Tier 2 — Standard
Use for:
- normal code or config changes
- extension adjustments with bounded blast radius
- schema or prompt work that affects runtime behavior indirectly

Typical checks:
- acceptance criteria review
- diff/file inspection
- relevant script/test/validator output
- known risks and gaps
- cleanup or state-restoration check when needed

Typical evidence:
- changed files
- validator report or command output
- reviewer notes
- risk summary

### Tier 3 — Strict
Use for:
- runtime safety controls
- task-discipline controls
- queue/orchestration logic
- branch/worktree protection logic
- anything with large blast radius or autonomy implications

Typical checks:
- all standard checks
- negative-path checks
- failure-path checks
- cleanup verification
- stronger reviewer/validator scrutiny
- explicit blocker and rollback consideration

Typical evidence:
- validation report
- exact failing/passing commands
- scenario coverage summary
- known limitations recorded explicitly

## Tier selection rule
Choose the highest applicable tier based on:
- mutation risk
- blast radius
- safety sensitivity
- autonomy impact
- difficulty of rollback

When unsure, round upward.

## Validation checklist logic
Validation should be consistent enough that two validators reviewing the same bounded task reach similar decisions.

### Core checklist categories
Every validation decision should examine:
- acceptance coverage
- evidence quality
- scope compliance
- safety compliance
- validation output quality
- unresolved risk visibility
- wiring verification when new runtime components were introduced

### Acceptance coverage
Check whether each acceptance criterion is:
- met
- partially met
- not met

A criterion should not be treated as met because the worker says so.
There should be proof.

### Evidence quality
Check whether evidence is:
- concrete
- relevant
- recent enough
- tied to the actual changed files or outputs

Weak evidence examples:
- `should work`
- `looks fine`
- `compiled in my head`

Strong evidence examples:
- report path
- command output summary
- file readback
- validator script output
- reviewer findings tied to files
- wiring or registration proof for new runtime components

### Scope compliance
Check whether the task stayed within:
- packet boundaries
- allowed files/domains
- approved risk level

Unexpected scope growth should produce at least:
- a visible note, or
- rejection/blocking if the growth is material

### Safety compliance
Check whether policy and runtime constraints were respected.
Examples:
- no protected path bypass
- no destructive git workaround
- no completion without evidence
- no silent task-discipline violation

### Validation output quality
Check whether the validation path itself is credible.
Examples:
- right script or command was used
- report is readable
- failures are not hidden
- cleanup status is visible when relevant

### Unresolved risk visibility
A task may still pass with minor known gaps if:
- the gaps do not break acceptance
- the gaps are visible
- the risk level is appropriate

Hidden gaps are worse than visible gaps.

## Pass / fail / blocked meanings

### `pass`
Use when:
- acceptance criteria are met
- evidence is sufficient
- no unresolved blocker prevents completion
- risk is acceptable for the task class

### `fail`
Use when:
- acceptance criteria are not met
- evidence contradicts the claim
- validation output shows the implementation is wrong
- the attempt should not be accepted as-is

### `blocked`
Use when:
- a required check cannot be performed yet
- evidence is missing because of an external blocker
- provider/tool/repo state prevents reliable validation
- human clarification or approval is required before a fair decision

Blocked is not the same as fail.
Blocked means the validator cannot fairly finish the decision path yet.

## Completion gates
Completion should be based on proof, not optimism.

### Minimum gate
A task should not complete unless it includes:
- changed files
- relevant validation or test output when appropriate
- short explanation of what was done
- unresolved risks or known gaps

This is already aligned with `AGENTS.md`.

### Docs/research exception rule
Research-only or docs-only tasks may use lighter validation, but still require visible evidence.
They are not exempt from evidence, only from heavier runtime checks when those are not relevant.

### Strict gate rule
For safety-sensitive or autonomy-sensitive changes, completion should require:
- standard evidence
- validator result
- negative-path coverage when applicable
- explicit note of remaining caveats

## Failure taxonomy
Recovery should reason from known failure classes.

### 1. Plan failure
Meaning:
- the task packet or plan was insufficient, unclear, or contradictory

Examples:
- acceptance criteria missing critical constraint
- worker packet omitted file boundaries
- planning assumption invalidated later

Typical response:
- reroute to planning or orchestrator
- revise packet
- avoid blind retry

### 2. Model failure
Meaning:
- the chosen model produced poor reasoning, shallow output, or repeated misunderstanding

Examples:
- repeated wrong edits despite clear packet
- weak review quality from an underspecified or underpowered lane

Typical response:
- retry with stronger model
- switch provider if repeated
- tighten packet or prompt if needed

### 3. Tool failure
Meaning:
- tools or tool wrappers prevented expected execution

Examples:
- runtime tool unavailable
- command environment broken
- extension interception behaving unexpectedly

Typical response:
- inspect tool/runtime state
- avoid blaming the worker first
- block or escalate if the tool path is unreliable

### 4. Repo-state failure
Meaning:
- git/worktree/file state made normal execution unsafe or contradictory

Examples:
- overlapping file ownership
- dirty worktree contamination
- wrong branch/worktree

Typical response:
- isolate or clean state
- requeue after repo is stable
- escalate if multiple lanes collide

### 5. Validation failure
Meaning:
- the implementation ran, but proof or outcomes did not satisfy acceptance

Examples:
- failed tests
- failed validator checks
- completion evidence missing

Typical response:
- route back for bounded fixes if the path is clear
- send to recovery if the cause is unclear or repeated

### 6. Ambiguity failure
Meaning:
- the system cannot proceed because the requirement itself is unclear

Examples:
- conflicting human goals
- missing approval boundary decision
- unclear expected output format

Typical response:
- block and escalate for clarification
- do not improvise across scope boundaries

## Retry logic
Retries should be bounded and explainable.
The system must not loop stupidly.

### General retry rules
- do not retry blindly
- classify the failure first
- preserve evidence from the failed attempt
- change something material before retrying
- stop retrying when the failure class says retry is unlikely to help

### Recommended default retry limits
Initial policy recommendation:
- same-lane retry: at most 1
- stronger-model retry: at most 1
- provider-switch retry: at most 1
- total retries per bounded task without human intervention: at most 2 or 3 depending on risk

Conservative interpretation:
- low-risk docs task may allow one simple retry
- strict validation or safety logic should escalate sooner

### When same-lane retry is allowed
Use when:
- failure is narrow and understood
- packet is still valid
- the same role can fix the issue with bounded changes

### When stronger-model retry is allowed
Use when:
- failure looks reasoning-related
- packet quality is adequate
- the task is worth another pass under a stronger lane

### When provider switch is allowed
Use when:
- provider instability is suspected
- the same provider failed repeatedly
- a fallback provider is already approved for that lane

### Forbidden retry situations
Do not retry blindly when:
- the requirement is ambiguous
- a protected-path approval is required
- repo state is unsafe
- validator evidence is contradictory and unexplained
- stop conditions or budgets are already exceeded

## Rollback policy
Rollback is better than retry when the system is becoming less trustworthy.

### Use rollback when
- a change clearly worsened the repo state
- retries are unlikely to fix the issue quickly
- the blast radius is growing
- recovery needs to return to a known good state before continuing
- a validator/reviewer concludes the current lane should be unwound

### Rollback evidence triggers
Strong rollback triggers include:
- repeated validation failure after bounded retries
- unsafe repo-state contamination
- overlapping or conflicting changes from multiple lanes
- safety-control regression

### Rollback scope
Rollback should be bounded.
Prefer rolling back:
- the current task lane
- the current worktree/branch
- the last bounded change set

Avoid broad or destructive rollback without human approval.

### Rollback approval
Human approval is required before destructive git history changes or forceful repo-level rollback actions.
This aligns with `AGENTS.md`.

## Recovery decision flow
Recommended flow:
1. collect failure evidence
2. classify failure type
3. check whether validation is truly complete or blocked
4. inspect retry history and budget
5. choose one action:
   - retry same lane
   - retry stronger model
   - switch provider
   - rollback
   - stop
   - escalate
6. record why that action was chosen

## Decision heuristics

### Prefer retry when
- the cause is understood
- the fix is bounded
- evidence is not contradictory
- limits are not exceeded

### Prefer rollback when
- repo state is worse than before
- repeated retries have low expected value
- safety-sensitive regressions appeared

### Prefer stop or escalate when
- requirements are ambiguous
- human approval is required
- the tool/runtime path is unreliable
- costs or retries exceeded bounds

## Reporting conventions
Validation and recovery outputs should remain decision-friendly.
They should include:
- what was checked
- what failed or blocked
- what evidence supports that conclusion
- what should happen next

Reviewer-style outputs should prefer:
- severity-ordered findings
- exact file references when possible
- clear fix direction
- named tests or validation still needed
- normalized review fields so downstream consumers can depend on more than prose:
  - `Severity Buckets: CRITICAL | HIGH | MEDIUM | LOW`
  - `Severity Summary: CRITICAL=<n> HIGH=<n> MEDIUM=<n> LOW=<n>`
  - `Required Fix Item Fields: severity | summary | file_ref | fix_direction | validation_needed`
  - `Optional Improvement Item Fields: summary | file_ref | benefit | follow_up`

Validator-style outputs should prefer:
- exact proof over narration
- explicit proof status and missing-proof categories when proof is weak or contradictory
- normalized validation fields:
  - `Proof Status: sufficient | partial | missing | contradictory`
  - `Missing Proof Category: none | acceptance_gap | evidence_missing | validation_missing | wiring_unchecked | blocked_dependency | contradictory_evidence`
  - `Missing Proof Item Fields: category | gap | evidence_needed | blocking_effect`
  - `Decision Basis: proof_sufficient | proof_gap | blocked_dependency`

Architecture-review outputs should prefer:
- intended vs implemented comparison
- visible drift summary
- tactical fixes before strategic redesign
- migration path when large architectural change is proposed

This should align with existing report conventions in `validation_architecture.md`.
Use `.pi/agent/docs/architecture_review_workflow.md` when the review scope is architectural, drift-oriented, or capability-assessment focused so tactical vs strategic recommendations stay bounded.

## Relationship to current validator assets
Current Phase A/B validator assets remain useful as the foundation:
- `scripts/validate-phase-a-b.sh`
- `.pi/agent/docs/runtime_validation_runbook.md`
- `.pi/agent/docs/operator_workflow.md`

The current repo-local slice now implements a bounded portion of Phase H by attaching:
- machine-readable completion-gate policy in `.pi/agent/validation/completion-gate-policy.json`
- task-class-aware validation checklist logic in `.pi/agent/extensions/till-done.ts`
- executable recovery policy logic in `.pi/agent/extensions/recovery-policy.ts`
- executable runtime recovery decision logic in `.pi/agent/extensions/recovery-runtime.ts`
- proof-based completion gating, rejection flow, and manual override coverage in `scripts/validate-phase-a-b.sh`
- targeted recovery validation coverage in `scripts/validate-recovery-policy.sh` and `scripts/validate-recovery-runtime.sh`

Future Phase H implementation should extend that foundation rather than replace it casually.

## Future evolution notes
Likely next implementation attachments:
- explicit tier selection rules in task packets
- richer validator/reviewer provenance fields if task state needs stronger auditability
- recovery reports tied to failure taxonomy codes
- queue-aware retry and stop-condition enforcement on top of the bounded recovery policy/runtime surfaces

Those should preserve the central rule:
- completion requires proof
- recovery requires classification
- retries must remain bounded
