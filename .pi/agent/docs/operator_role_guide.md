# Operator Role Guide

This guide explains what each current role is for at an operator level.

## Planning side
### orchestrator
- coordinates the next bounded step
- chooses which helper surface or team path to use
- should not improvise broad uncontrolled work

### planning_lead
- handles planning/design/reconciliation work
- should clarify scope before build work starts

### research_worker
- good for read-heavy bounded analysis
- cheapest normal lane for research-like work

### docs_worker
- good for docs-only or operator-facing wording work
- should not silently widen into code changes

## Build side
### build_lead
- coordinates bounded implementation work
- now has a cheaper default reasoning profile than critical roles

### frontend_worker
- scoped frontend implementation lane

### backend_worker
- scoped backend implementation lane

### infra_worker
- higher-risk lane for repo/runtime/config/infrastructure-sensitive work
- treated as critical in routing

## Quality side
### quality_lead
- coordinates quality/review stage
- treated as critical in routing

### reviewer_worker
- focuses on review findings and scoped review outcomes
- treated as critical in routing

### validator_worker
- focuses on proof and validator decisions
- treated as critical in routing

## Recovery side
### recovery_worker
- reasons about bounded retry/stop/rollback direction
- treated as critical in routing

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
