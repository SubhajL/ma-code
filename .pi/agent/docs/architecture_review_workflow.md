# Architecture Review Workflow

This workflow turns the useful `g-review` patterns into repo-local review behavior.
It is for architecture, drift, and capability-assessment work.

## Purpose
Use this workflow when the goal is to answer questions like:
- what did we intend to build?
- what is actually implemented now?
- where has meaningful drift appeared?
- what should be fixed tactically now?
- what strategic changes are justified later?

## Core review method
For bounded architecture review, compare these explicitly:
1. intended design
2. implemented design
3. important drift
4. tactical next steps
5. strategic changes only when justified

## Minimum architecture review output
A useful architecture/drift review should include:
- the intended behavior or capability target
- the current implemented behavior
- important drift or mismatch
- why the drift matters
- tactical fixes that fit current scope
- strategic changes only when the tactical path is insufficient
- a bounded migration path when a large change is proposed

## Reusable review artifacts
Use these repo-local templates when you want concrete architecture-review inputs or outputs instead of hand-wavy freeform requests:
- architecture review request: `.pi/agent/prompts/templates/request-architecture-review.md`
- drift/capability assessment: `.pi/agent/prompts/templates/assess-drift-capability.md`
- migration-path proposal: `.pi/agent/prompts/templates/propose-migration-path.md`

Recommended use:
- use `request-architecture-review.md` to scope intended behavior, evidence to inspect, and the drift questions that matter
- use `assess-drift-capability.md` when a capability claim or maturity label needs a concrete acceptable/tactical/strategic drift judgment
- use `propose-migration-path.md` when a large change is justified and the review must stay rollout-aware rather than abstract

## Tactical vs strategic rule
Prefer tactical recommendations first.

Tactical recommendations are things like:
- tighten a prompt contract
- improve task packet completeness
- add a validator or test
- fix routing or handoff wiring
- clarify operator workflow or docs

Strategic recommendations are things like:
- redesign a subsystem
- split a runtime surface
- add a daemon/control plane
- change orchestration boundaries

Do not jump to strategic advice unless:
- the tactical path is clearly insufficient, or
- the current design creates recurring unsafe drift

## Migration path rule
If a strategic change is recommended, include:
- why the current state is insufficient
- benefits
- costs or risks
- bounded migration path
- rollout or validation checkpoints

A large change without a migration path is not review-complete.

## Capability assessment workflow
When reviewing roadmap or maturity claims, answer in this order:
1. what capability is claimed?
2. what executable/runtime proof exists?
3. what operator-visible proof exists?
4. what remains partial or missing?
5. what is the most accurate label for current capability?

Prefer labels that do not overstate maturity.

## Drift assessment workflow
When reviewing drift, classify it as:
- acceptable drift: implementation is narrower than aspirational docs but still honest and safe
- tactical drift: implementation and docs/prompts/workflows need bounded alignment
- strategic drift: the current architecture and the intended model are materially diverging

Recommended default response:
- acceptable drift -> note it clearly
- tactical drift -> fix prompts/docs/tests/wiring in bounded scope
- strategic drift -> escalate with migration path options

## Where this workflow should be encoded
Primary repo-local surfaces:
- `.pi/agent/prompts/roles/reviewer_worker.md`
- `.pi/agent/prompts/roles/recovery_worker.md`
- `.pi/agent/prompts/roles/orchestrator.md`
- `.pi/agent/docs/codex_skill_patterns_for_pi_harness.md`
- `.pi/agent/docs/harness_phase_capability_map.md`
- `.pi/agent/docs/validation_recovery_architecture.md`

## Non-goal
This workflow does not make external `g-review` availability a runtime dependency.
It only adapts the useful architecture-review discipline into repo-local harness behavior.
