# Operator Role Guide

This guide explains what each current role is for at an operator level.
It also notes the main repo-local expectations shaped from the useful `g-*` skill patterns.

## Planning side
### orchestrator
- coordinates the next bounded step
- chooses which helper surface or team path to use
- should not improvise broad uncontrolled work
- should require planning/task-packet outputs to preserve goal, non-goals, scope boundaries, validation ideas, and wiring checks before build work starts
- should escalate if a large architectural change is proposed without a bounded migration path

### planning_lead
- handles planning/design/reconciliation work
- should clarify scope before build work starts
- should make plans decision-complete enough that builders do not have to guess the real objective
- should identify files to inspect/change, validation ideas, and wiring checks explicitly

### research_worker
- good for read-heavy bounded analysis
- cheapest normal lane for research-like work
- should record whether discovery used Auggie-first or local fallback

### docs_worker
- good for docs-only or operator-facing wording work
- should not silently widen into code changes

## Build side
### build_lead
- coordinates bounded implementation work
- now has a cheaper default reasoning profile than critical roles
- should preserve planning outputs in worker packets rather than collapsing them into vague assignments

### frontend_worker
- scoped frontend implementation lane
- should provide smallest relevant proof and skeptical self-review before handoff

### backend_worker
- scoped backend implementation lane
- should provide smallest relevant proof and skeptical self-review before handoff

### infra_worker
- higher-risk lane for repo/runtime/config/infrastructure-sensitive work
- treated as critical in routing
- should provide smallest relevant proof and skeptical self-review before handoff

## Quality side
### quality_lead
- coordinates quality/review stage
- treated as critical in routing
- should set review/validation scope so reviewer and validator outputs are concrete, evidence-backed, and easy to act on

### reviewer_worker
- focuses on review findings and scoped review outcomes
- treated as critical in routing
- should prefer severity-ordered findings, exact file references, concrete fix direction, and named missing tests/validation
- when the scope is architectural or drift-oriented, should compare intended vs implemented behavior and separate tactical fixes from strategic recommendations

### validator_worker
- focuses on proof and validator decisions
- treated as critical in routing
- should prefer exact proof over narration and name the specific missing validation or evidence when proof is weak

## Recovery side
### recovery_worker
- reasons about bounded retry/stop/rollback direction
- treated as critical in routing
- should prefer tactical fixes before strategic redesign and include a bounded migration path for large change recommendations

## Practical operator takeaway
You do not need to manually switch roles by intuition each time.
The harness already has executable helpers for:
- routing
- team activation
- task packets
- handoffs
- recovery decisions
- queue stepping

But the operator should still understand role intent so that:
- the right workflow is chosen
- scope growth is noticed early
- weak-value escalation is challenged instead of accepted blindly
- planning/review/validation expectations stay consistent with the repo-local prompt contracts
