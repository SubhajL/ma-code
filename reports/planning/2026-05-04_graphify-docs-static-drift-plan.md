# Plan: Graphify Docs Static Drift Checks

## Discovery Path
- Used `g-planning`.
- Read repo rules and current logs: `AGENTS.md`, `logs/CURRENT.md`.
- Confirmed root repo was clean/synced `main` at `e18cc1da4037fc60f981db6109b96ce0f663e04e` before mutation.
- Created active task `task-1777888435970` before mutation.
- Created isolated worktree/branch: `/Users/subhajlimanond/dev/ma-code-worktrees/task-1777888435970-graphify-docs-static-drift` / `split/task-1777888435970-graphify-docs-static-drift`.
- Auggie-first discovery timed out; used local `rg` and targeted `read` fallback.
- Inspected `scripts/check-repo-static.sh`, README, operator workflow, queue semantics, validation architecture, team orchestration, Graphify adapter/final runbook references, and relevant tests/static validators.

## Goal
- Add docs/static checks to prevent drift across the Graphify lifecycle:
  - explicit research queue-session orchestration
  - `graphifyEvidence` packet/handoff metadata
  - `task_update validate` consumption
  - final source verification requirements

## Non-Goals
- Do not add new runtime Graphify behavior.
- Do not run Graphify.
- Do not make Graphify globally mandatory.
- Do not add `--watch`, daemon, background behavior, or direct runtime JSON edits.
- Do not redesign Graphify docs.

## Assumptions
- A canonical lifecycle contract should live in docs and be asserted by `scripts/check-repo-static.sh`.
- Static drift checks are enough for this slice; existing runtime behavior tests already cover prior runtime features.
- The static contract should be exact enough to fail on meaningful drift but short enough to maintain.

## Cross-Model Check
- Used `second_model_plan`.
- Adopted its recommendation to add a canonical “Graphify evidence lifecycle drift guard” section plus cross-document static assertions.
- Broadened from README-only to Graphify/operator/queue/team/validation docs for stronger drift prevention.

## Plan Draft A
- Add a new static checker block that requires exact lifecycle language across README, operator workflow, queue semantics, team orchestration, validation architecture, Graphify adapter, and Graphify final runbook.
- Run static check to RED, then add docs to GREEN.

## Plan Draft B
- Add only README contract and references from a few docs.
- Smaller but weaker; a future edit could drift Graphify adapter/final runbook without failing static checks.

## Unified Plan
- Use Draft A with bounded exact strings:
  - section title: `## Graphify evidence lifecycle drift guard`
  - contract: `explicit research queue-session orchestration -> graphifyEvidence in packet/handoff -> task_update validator consumption`
  - safety: `metadata is optional`, `no global mandatory Graphify`, `no Graphify CLI --watch, daemon, or background behavior`, `source verification remains required`
- Add static assertions first and run RED.
- Add concise docs sections/references.
- Run static and relevant validators to GREEN.
- g-check review, PR, PR gate, merge, sync main.

## Files to Modify
- `scripts/check-repo-static.sh`
- `README.md`
- `.pi/agent/docs/operator_workflow.md`
- `.pi/agent/docs/queue_semantics.md`
- `.pi/agent/docs/team_orchestration_architecture.md`
- `.pi/agent/docs/validation_architecture.md`
- `.pi/agent/docs/graphify_adapter.md`
- `.pi/agent/docs/graphify_final_runbook.md`
- `logs/CURRENT.md`
- `logs/coding/2026-05-04_graphify-docs-static-drift.md`

## New Files
- `reports/planning/2026-05-04_graphify-docs-static-drift-plan.md`
- `logs/coding/2026-05-04_graphify-docs-static-drift.md`

## TDD Sequence
1. Add static assertions in `scripts/check-repo-static.sh` for the lifecycle drift guard strings.
2. Run `bash scripts/check-repo-static.sh` and confirm RED because docs do not yet contain the contract.
3. Add the smallest docs updates that satisfy the assertions.
4. Rerun `bash scripts/check-repo-static.sh` and confirm GREEN.
5. Run relevant broader validators and `git diff --check`.
6. Repeat static check enough to catch obvious flakiness.

## Test Coverage
- Static checker proves the lifecycle contract remains present in canonical and cross-reference docs.
- Existing runtime/unit validators prove code still compiles and Graphify runtime surfaces remain wired.

## Acceptance Criteria
- Static check fails before docs are added and passes after.
- Docs describe queue orchestration -> packet/handoff evidence -> validator consumption lifecycle.
- Docs explicitly preserve optional/non-global/no-watch/source-verification safety boundaries.
- Relevant validation gates pass.
- PR merged to main and local main synced.

## Wiring Checks
| Component | Entry point | Schema/table | Verification |
| --- | --- | --- | --- |
| Static drift guard | `scripts/check-repo-static.sh` | none | RED/GREEN static check and exact string assertions. |
| Canonical lifecycle docs | README and `.pi/agent/docs/*` | none | Static checker asserts lifecycle title/contract/safety strings across docs. |

## Validation
- `bash scripts/check-repo-static.sh`
- `bash scripts/check-foundation-extension-compile.sh`
- `bash scripts/validate-extension-unit-tests.sh --report /tmp/graphify-docs-static-drift-ext.md --summary-json /tmp/graphify-docs-static-drift-ext.json`
- `bash scripts/validate-graphify-discovery.sh --report /tmp/graphify-docs-static-drift-graphify.md --summary-json /tmp/graphify-docs-static-drift-graphify.json`
- `bash scripts/validate-core-workflows.sh --report /tmp/graphify-docs-static-drift-core.md --summary-json /tmp/graphify-docs-static-drift-core.json`
- `git diff --check`
- PR gate with no-watch helper.

## Risks
- Exact string assertions may be brittle; mitigate by using a short canonical phrase plus safety fragments.
- Docs may imply Graphify is mandatory; mitigate by asserting optional/no-global/no-watch language.
- Over-broad scope; keep to docs/static only.

## Pi Log Update
- Planning log: `reports/planning/2026-05-04_graphify-docs-static-drift-plan.md`
- Coding log: `logs/coding/2026-05-04_graphify-docs-static-drift.md`
