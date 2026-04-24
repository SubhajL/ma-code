# Operator Model Routing Guide

This guide explains how the current harness chooses models and thinking levels.

## Source of truth
Machine-readable routing policy lives in:
- `.pi/agent/models.json`

Executable resolver lives in:
- `.pi/agent/extensions/harness-routing.ts`

## What routing decides
For each harness role, routing resolves:
- provider
- model
- thinking level
- whether a fallback/budget/stronger override applies
- whether a role is treated as critical

## Current tuning shape
The current tuning pass keeps critical roles expensive enough to stay trustworthy, while making non-critical defaults cheaper.

### Critical roles
Critical roles keep a high-thinking floor, including:
- orchestrator
- planning_lead
- quality_lead
- infra_worker
- reviewer_worker
- validator_worker
- recovery_worker

### Cheaper non-critical defaults
Current cost tuning reduced default thinking for:
- build_lead
- frontend_worker
- backend_worker

And added a budget override path for:
- build_lead -> `openai-codex/gpt-5.4-mini`
- frontend_worker -> `openai-codex/gpt-5.4-mini`
- backend_worker -> `openai-codex/gpt-5.4-mini`

## Important routing concepts
### default
Normal route for the role.

### budget_pressure
Cheaper path when the policy allows it.
Used only for eligible non-critical roles.

### task_simpler
Allows cheaper handling for bounded simpler work.

### task_harder
Raises reasoning depth and may prefer a stronger override.
This is how the harness keeps harder work from becoming too cheap.

### provider_failure
Filters failed models and falls back conservatively.

## How to inspect routing locally
```bash
npm run validate:harness-routing
npm run validate:tuning-data
```

## When to retune routing
Retune only when you have evidence from:
- harness-routing validation
- queue-runner validation
- core-workflow validation
- scheduled workflow dry runs

Not just intuition.

## Where routing changes are documented
Current before/after tuning history is recorded in:
- `.pi/agent/models.json` under `tuning_history`
