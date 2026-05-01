# Planning Log — harness-051-semantic-conformance-fixtures

- Date: 2026-05-01
- Scope: Plan HARNESS-051 slice 1 semantic conformance fixtures for critical prompt surfaces only.
- Status: ready
- Related coding log: `logs/coding/2026-05-01_harness-051-semantic-conformance-fixtures.md`

## Goal
- Add a bounded local semantic conformance validator for the critical prompt surfaces: orchestrator, quality_lead, reviewer_worker, validator_worker, and recovery_worker.
- Prove golden fixtures parse cleanly and failing fixtures are rejected with clear reasons.
- Keep this slice deterministic, parser-oriented, and local-only before the later HARNESS-051 live proof slice.

## Scope
- Keep the existing prompt-contract validator for shape checks.
- Add a new semantic fixture inventory and a dedicated validator script for bounded semantic checks.
- Wire the new semantic validator into package/docs discoverability immediately.
- Defer mandatory `check-repo-static.sh` enforcement unless the dedicated validator proves stable, low-noise, and clearly actionable during implementation.
- Add RED/GREEN proof for golden and failing examples only.

## Files to Create or Edit
- `logs/CURRENT.md`
- `logs/coding/2026-05-01_harness-051-semantic-conformance-fixtures.md`
- `reports/planning/2026-05-01_harness-051-semantic-conformance-fixtures-plan.md`
- `.pi/agent/validation/prompt-semantics.json`
- `scripts/validate-prompt-semantics.sh`
- `scripts/check-repo-static.sh`
- `package.json`
- `README.md`
- `.pi/agent/docs/validation_architecture.md`
- `.pi/agent/docs/file_map.md`
- optional focused test/fixture helper under `tests/` only if the validator script needs a dedicated isolated proof path beyond fixture-driven script output

## Why Each File Exists
- `prompt-semantics.json`: machine-readable semantic fixture inventory and parser-oriented expectations.
- `validate-prompt-semantics.sh`: dedicated bounded semantic validator.
- `check-repo-static.sh`, `package.json`, docs, README: discoverability and stable wiring.
- paired logs: bounded evidence path for this feature group.

## What Logic Belongs There
- golden and failing fixture entries for the five critical roles.
- exact parser-oriented expectations for semantic lines/fields such as:
  - orchestrator decision line + section usability
  - quality_lead routing decision usability
  - reviewer severity/fix item structure usability
  - validator proof/missing-proof/final-decision usability
  - recovery recommended-action and escalation/migration-path usability
- deterministic pass/fail reasons without provider calls.
- allowlist-style semantic checks on contract-bearing fields only; do not validate whole prose blobs.
- wording-tolerant parsing where minor phrasing should not matter, while keeping exact checks for truly contractual lines/enums.

## What Should Not Go There
- no live provider-backed proof in this slice.
- no broad AI semantic scoring.
- no prompt redesign unless a current prompt blocks bounded fixture creation.
- no replacement of the existing prompt-contract validator.

## Dependencies
- HARNESS-043 prompt-contract validator is already landed and remains the shape layer.
- Existing critical role prompts already expose normalized lines/headers that semantic fixtures can target.
- Active task: `task-1777637205552`
- Isolated worktree: `/Users/subhajlimanond/dev/ma-code-worktrees/task-1777637205552-harness-051-slice1-semantic`

## Acceptance Criteria
- A dedicated local semantic conformance validator exists for orchestrator, quality_lead, reviewer_worker, validator_worker, and recovery_worker.
- Golden fixtures parse cleanly.
- Failing fixtures are rejected with clear role-specific reasons.
- Validation/docs/package/static wiring make the semantic validator discoverable.
- The slice is ready to continue into g-coding implementation, PR, merge, and main sync.

## Likely Failure Modes
- overloading semantic checks into fuzzy scoring instead of deterministic parsing.
- replacing or tangling the existing prompt-contract validator instead of extending validation additively.
- making fixtures too brittle by matching whole prose blocks rather than contract-bearing lines/fields.
- silently widening into live proof work from HARNESS-051 slice 2.
- promoting semantic validation into `check-repo-static.sh` before the failure messages and false-positive rate are good enough for a default local gate.

## Validation Plan
- RED:
  - add golden and failing fixture entries first
  - run the new semantic validator stub/path and confirm bad examples are currently unhandled
- GREEN:
  - `bash scripts/validate-prompt-semantics.sh`
  - `bash scripts/validate-prompt-contracts.sh`
  - `git diff --check`
- staged rollout decision:
  - first land the dedicated semantic validator as an explicit command plus package/docs discoverability
  - add `bash scripts/check-repo-static.sh` semantic enforcement only if implementation shows the validator is stable, low-noise, and fast enough for the default local gate
- optional broader confidence after implementation:
  - `bash scripts/check-foundation-extension-compile.sh` if touched files broaden into TS/script surfaces beyond shell/python-style validator logic

## Recommended Next Step
- Keep the plan bounded to local semantic fixtures only, then switch to g-coding in this worktree for TDD implementation and later PR/merge/main sync.
