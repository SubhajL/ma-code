# Graphify Orchestration Decision Helper Plan

## Discovery Path
- Read `AGENTS.md`, `README.md`, `logs/CURRENT.md`, and `g-check` guidance.
- Used `auggie_discover` first with a bounded timeout; it timed out and recommended local fallback.
- Local fallback used `rg` and targeted reads of `.pi/agent/extensions/graphify-validation-decision.ts`, `tests/extension-units/graphify-validation-decision.test.ts`, and `scripts/validate-graphify-discovery.sh`.
- Used `second_model_plan`; it agreed on a pure helper, unit tests, and static wiring, while warning not to over-scope into runtime orchestration.

## Goal
- Add a pure `decideGraphifyOrchestration` helper that decides the next bounded Graphify orchestration action from explicit inputs.

## Non-Goals
- Do not run Graphify.
- Do not add a daemon, background watcher, or auto scan.
- Do not mutate runtime state or protected runtime JSON.
- Do not enable Graphify CLI `--watch`.

## Assumptions
- This is the first orchestration-decision slice; runtime tool composition can come later.
- The helper should live beside Graphify validation decision logic and be covered by extension unit validators.

## Plan Draft A
- Create a new helper file and new test file.
- Wire validators/static checks to include the helper.
- Keep action names explicit and audit-friendly.

## Plan Draft B
- Extend `graphify-validation-decision.ts` directly with orchestration logic.
- Reuse existing test file.
- Smaller file count but risks mixing validation proof decisions with orchestration next-action decisions.

## Unified Plan
- Use Draft A: separate helper for cleaner layering.
- Add tests first, confirm missing module RED, implement minimal helper, then wire validators/static checks.

## Files to Modify
- `scripts/check-foundation-extension-compile.sh`
- `scripts/validate-extension-unit-tests.sh`
- `scripts/validate-graphify-discovery.sh`
- `scripts/check-repo-static.sh`
- `logs/CURRENT.md`

## New Files
- `.pi/agent/extensions/graphify-orchestration-decision.ts`
- `tests/extension-units/graphify-orchestration-decision.test.ts`
- `reports/planning/2026-05-04_graphify-orchestration-decision-plan.md`
- `logs/coding/2026-05-04_graphify-orchestration-decision.md`

## TDD Sequence
1. Add `tests/extension-units/graphify-orchestration-decision.test.ts` importing the missing helper.
2. Run the targeted test and confirm RED is missing module/helper.
3. Implement the smallest pure helper to pass tests.
4. Refactor minimally while green.
5. Add validator/static wiring and rerun relevant gates.

## Test Coverage
- no discovery needed
- local verification fallback for exact/narrow needs
- Graphify unavailable
- missing graph
- stale graph
- dirty worktree
- approval required
- preflight token required
- query proof needed
- source verification needed
- ready to use graph evidence

## Acceptance Criteria
- Helper is pure and side-effect free.
- Unit tests pass with RED/GREEN evidence.
- Extension compile, extension unit validation, Graphify discovery validation, repo static checks, and diff check pass.
- Merged to main and root local main synced.

## Wiring Checks
| Component | Runtime entry point | Registration | Verification |
| --- | --- | --- | --- |
| `graphify-orchestration-decision.ts` | pure import/export only | no tool registration in this slice | unit test import, foundation compile, extension unit validator, Graphify discovery validator, static check |

## Validation
- `npx --yes tsx --test tests/extension-units/graphify-orchestration-decision.test.ts`
- `bash scripts/validate-extension-unit-tests.sh`
- `bash scripts/check-foundation-extension-compile.sh`
- `bash scripts/validate-graphify-discovery.sh`
- `bash scripts/check-repo-static.sh`
- `git diff --check`

## Risks
- Overclaiming orchestration: this helper decides only; it does not execute scans.
- Too many actions: keep actions small and focused on next safe operator/runtime step.

## Pi Log Update
- Planning log: `reports/planning/2026-05-04_graphify-orchestration-decision-plan.md`
- Coding log: `logs/coding/2026-05-04_graphify-orchestration-decision.md`
