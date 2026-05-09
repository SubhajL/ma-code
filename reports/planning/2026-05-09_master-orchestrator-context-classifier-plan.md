# Master Orchestrator Context Classifier Plan

- Direct-implementation exemption: internal harness safety/runtime slice requested by operator; no product intake needed.
- Goal: add read-only repo/initiative context classification so MO does not assume greenfield from labels or stale initiative names.
- First TDD slice: `harness:orchestrate context --initiative greenfield-scaffold --json` reports this repo as `existing_harness_repo`, initiative maturity as `active_existing_initiative`, and `greenfieldEligible: false`.
- Acceptance: context helper/CLI/tests/validator/docs/static wiring pass; no workers, queues, PR creation, merge, or runtime JSON mutation in context mode.
