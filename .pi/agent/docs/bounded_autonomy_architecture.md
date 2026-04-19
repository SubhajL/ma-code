# Bounded Autonomy Architecture

This document is a short architecture stub for Phase I.
It defines what long-running autonomy should mean in this harness without implying that the feature is already implemented.

## Purpose
Bounded autonomy should let the harness process small queued jobs with limited human prompting while staying safe, reviewable, and stoppable.

The goal is not:
- endless self-directed coding
- uncontrolled repo mutation
- vague “agent loop” behavior

The goal is:
- one bounded job at a time
- explicit stop conditions
- visible failures and blockers
- evidence-backed completion

## Scope
This doc outlines:
- queue-driven execution intent
- execution boundaries
- stop conditions
- scheduled workflow boundaries
- reporting expectations

It does not define full runner implementation details.

## Core model
Recommended Phase I model:
1. queue contains bounded jobs
2. orchestrator selects the next eligible job
3. one job runs at a time per queue executor
4. the job creates or drives bounded tasks
5. quality/validation gates still apply
6. the system stops, blocks, fails, or completes explicitly

## Design rules
- autonomy must be queue-driven, not free-roaming
- every job must have scope
- every job should have a budget or default conservative limits
- blocked and failed must stay distinct
- retries must remain bounded
- completion must remain evidence-based
- risky actions still require human approval

## Stop conditions
Phase I should enforce explicit stops such as:
- max retries reached
- max runtime reached
- max cost reached
- max unresolved blockers reached
- max failed validations reached
- protected-path or approval boundary hit
- scope expansion beyond the job packet

If a stop condition is hit, the job should not keep drifting.
It should move to `blocked`, `failed`, or `escalate` depending on the cause.

## Scheduled workflows
Scheduled workflows are acceptable only when they are repetitive and bounded.
Good candidates:
- daily review queue
- nightly docs cleanup
- test triage
- backlog summarization

Bad candidates:
- “improve the repo continuously”
- open-ended refactor sweeps without narrow scope

## Reporting expectations
Each autonomous run should leave visible artifacts such as:
- job start/finish status
- blocker or failure reason
- evidence or validation output
- unresolved risks

A long-running system without reports is not acceptable.

## Human boundary
Bounded autonomy still keeps humans in control for:
- risky or destructive actions
- approval-gated changes
- ambiguous requirements
- repeated failures
- rollback decisions with destructive git implications

## Success definition
Phase I is successful when the harness can safely process bounded queued work without endless drift.
It is not successful merely because it can keep itself busy.
