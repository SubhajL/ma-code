# Plan: Validator Checks Consume Graphify Orchestration Evidence

## Discovery Path
- Used `g-planning`.
- Read `AGENTS.md`, `README.md`, `logs/CURRENT.md`, and repo status first.
- Root `/Users/subhajlimanond/dev/ma-code` was clean synced `main` at `f9f90d94916631e5eaabc473ef88337f4cc9be0f`.
- Created active task `task-1777886304207` before mutation.
- Created isolated worktree/branch: `/Users/subhajlimanond/dev/ma-code-worktrees/task-1777886304207-validator-graphify-orchestration-evidence` / `split/task-1777886304207-validator-graphify-orchestration-evidence`.
- Auggie-first discovery attempted and timed out; used local fallback with `rg` and targeted `read`.
- Inspected:
  - `.pi/agent/extensions/till-done.ts`
  - `.pi/agent/extensions/graphify-validation-decision.ts`
  - `.pi/agent/extensions/task-packets.ts`
  - `.pi/agent/extensions/handoffs.ts`
  - `tests/extension-units/till-done.test.ts`
  - `tests/extension-units/orchestration-helpers.test.ts`
  - `scripts/check-repo-static.sh`
  - `scripts/validate-extension-unit-tests.sh`
  - `scripts/validate-core-workflows.sh`
  - `.pi/agent/docs/validation_architecture.md`
- Used `second_model_plan`; adapted its recommendations to this repo's actual files.

## Goal
- Add validator checks that consume structured Graphify orchestration evidence from `graphifyEvidence` metadata.
- Let `task_update action=validate` derive Graphify validation proof from orchestration evidence when explicit `graphifyValidation` is absent.

## Non-Goals
- Do not run Graphify during validation.
- Do not make Graphify globally mandatory.
- Do not parse free-form evidence strings as proof.
- Do not add watch/daemon/background behavior.
- Do not edit live protected runtime JSON.
- Do not redesign task packets, handoffs, or queue sessions.

## Assumptions
- `graphifyEvidence` is the structured carrier from prior slice.
- Validator can treat `graphifyOrchestrationAction: query_graph` or `graphifyAdapterAction: query` as latest relevant graph queried proof.
- Validator can treat `graphifyOrchestrationAction: check_freshness` or `graphifyAdapterAction: freshness` as freshness/cadence proof.
- Source verification must remain explicit via `importantClaimsSourceVerified: true`.
- Explicit `graphifyValidation` should take precedence over derived `graphifyEvidence`.

## Cross-Model Check
- `second_model_plan` used.
- Kept recommendations to add input type/schema support, mapping logic, tests for pass/block, precedence checks, and schema/static validation.
- Corrected file paths from the second-model response to actual repo-local extension files.

## Plan Draft A
- Extend `task_update validate` with optional `graphifyEvidence`.
- Normalize evidence into `GraphifyValidationDecisionInput` when explicit `graphifyValidation` is missing.
- Add tests in `till-done.test.ts` proving pass/block behavior and explicit-input precedence.
- Update docs/static checks.

## Plan Draft B
- Do not change `task_update`; instead require validators to manually transform `graphifyEvidence` into existing `graphifyValidation` input.
- Add prompt/docs only.
- Smaller code surface, but fails the request to add validator checks that consume orchestration evidence directly.

## Unified Plan
- Use Draft A.
- Add a small local `GraphifyEvidenceInput` type/schema to `till-done.ts` matching the prior packet/handoff fields needed for validation.
- Add helper `graphifyValidationFromEvidence`.
- Validation input selection order:
  1. explicit `params.graphifyValidation`
  2. derived from `params.graphifyEvidence`
  3. implicit required placeholder when acceptance includes Graphify-backed
- Preserve current blocking semantics from `decideGraphifyValidation`.
- Record Graphify validation decision evidence as today.

## Files to Modify
- `.pi/agent/extensions/till-done.ts`
- `tests/extension-units/till-done.test.ts`
- `scripts/check-repo-static.sh`
- `.pi/agent/docs/validation_architecture.md`
- `README.md`
- `logs/CURRENT.md`
- `logs/coding/2026-05-04_validator-graphify-orchestration-evidence.md`

## New Files
- `reports/planning/2026-05-04_validator-graphify-orchestration-evidence-plan.md`
- `logs/coding/2026-05-04_validator-graphify-orchestration-evidence.md`

## TDD Sequence
1. Add a test in `tests/extension-units/till-done.test.ts` where Graphify-backed validation passes using `graphifyEvidence` with query orchestration evidence and source verification.
2. Run isolated extension-unit validator and confirm RED because `graphifyEvidence` is ignored or rejected.
3. Implement minimal schema/type/helper changes in `till-done.ts`.
4. Rerun targeted validator and confirm GREEN for the pass case.
5. Add/confirm test where query evidence without source verification blocks.
6. Add/confirm test where explicit `graphifyValidation` takes precedence over contradictory `graphifyEvidence`.
7. Run full extension-unit validator, foundation compile, core workflows, static checks, and diff check.
8. Run flake check with 3 consecutive relevant validator passes.

## Test Coverage
- `task_update validate` passes required Graphify-backed acceptance using `graphifyEvidence` query/source proof.
- `task_update validate` blocks when orchestration evidence lacks source verification.
- Explicit `graphifyValidation` overrides/has precedence over `graphifyEvidence`.
- Existing non-Graphify validation tests remain unchanged.

## Acceptance Criteria
- `task_update` accepts optional `graphifyEvidence` for validation.
- Validator consumes orchestration evidence without free-form parsing.
- Required Graphify proof still blocks when source or graph/freshness proof is missing.
- Non-Graphify/default validation remains unaffected.
- Validators/static/docs pass.
- PR merged to main and local main synced.

## Wiring Checks
| Component | Runtime entry point | Registration/schema | Verification |
| --- | --- | --- | --- |
| Validator evidence consumption | `.pi/agent/extensions/till-done.ts` / `task_update validate` | `TaskUpdateSchema`, `TaskUpdateParams`, helper mapping to `decideGraphifyValidation` | Unit tests inspect `details.graphifyValidation` and task evidence. |
| Graphify decision helper | `.pi/agent/extensions/graphify-validation-decision.ts` | existing `decideGraphifyValidation` | Existing tests plus new till-done tests prove derived input reaches helper. |
| Static/doc contract | `scripts/check-repo-static.sh` | assertions over code/docs | Static check fails if helper/docs disappear. |

## Validation
- `bash scripts/validate-extension-unit-tests.sh --report /tmp/validator-graphify-orchestration-ext.md --summary-json /tmp/validator-graphify-orchestration-ext.json`
- `bash scripts/check-foundation-extension-compile.sh`
- `bash scripts/validate-core-workflows.sh --report /tmp/validator-graphify-orchestration-core.md --summary-json /tmp/validator-graphify-orchestration-core.json`
- `bash scripts/check-repo-static.sh`
- `git diff --check`
- PR gate via `npx --yes tsx scripts/harness-pr-gate.ts --pr <PR> --once`.

## Risks
- Mapping could over-trust orchestration action names; mitigate by requiring source verification separately.
- Optional evidence might accidentally override explicit validator input; mitigate with explicit precedence test.
- Docs could imply Graphify is mandatory; wording must stay scoped/optional.
- Direct local `npx tsx --test` may fail without installed deps; use isolated validator as proof when needed.

## Pi Log Update
- Planning log: `reports/planning/2026-05-04_validator-graphify-orchestration-evidence-plan.md`
- Coding log: `logs/coding/2026-05-04_validator-graphify-orchestration-evidence.md`
