# Planning Log — harness-037-extension-unit-tests

- Date: 2026-04-20
- Scope: Implement bounded HARNESS-037 extension unit tests for safety/task-discipline runtime controls and practical orchestration helpers.
- Status: ready
- Related coding log: `logs/coding/2026-04-20_harness-037-extension-unit-tests.md`

## Discovery Path
- Auggie-first attempt:
  - `auggie_discover`
  - result: timeout
  - fallback: local discovery with `read`, `find`, and `rg`
- Inspected:
  - `AGENTS.md`
  - `README.md`
  - `pi_harness_implementation_backlog_REPO_LOCAL.md` (`HARNESS-037`, `HARNESS-038`)
  - `.pi/agent/extensions/safe-bash.ts`
  - `.pi/agent/extensions/till-done.ts`
  - `.pi/agent/extensions/harness-routing.ts`
  - `.pi/agent/extensions/team-activation.ts`
  - `.pi/agent/extensions/task-packets.ts`
  - `.pi/agent/extensions/handoffs.ts`
  - `scripts/check-foundation-extension-compile.sh`
  - existing `scripts/validate-*.sh` patterns
- Cross-model planning fallback:
  - `second_model_plan` unavailable because Anthropic credits are too low
  - main/current model plan kept

## Goal
- Add a bounded, repeatable extension unit-test suite that covers:
  - `safe-bash.ts`
  - `till-done.ts`
  - practical helper-level behavior in routing/team/packet/handoff extensions
- Reduce regression risk before queue/recovery runtime work lands.

## Non-Goals
- no HARNESS-038 end-to-end queue/integration test suite
- no live provider-backed validation dependency for the unit-test suite
- no UI or queue-runner implementation
- no broad repo-wide JS test framework rollout beyond the harness extension surface

## Assumptions
- a dedicated validator-style script is a better fit than introducing a permanent root package manager workspace for now
- `safe-bash.ts` and `till-done.ts` can be unit-tested through fake `ExtensionAPI` registrations plus temp directories
- helper-level tests for routing/team/packet/handoff are sufficient for the “where practical” portion of the request because those modules already export pure functions
- CI should run the unit-test validator as a separate job or separate validator step

## Cross-Model Check
- attempted `second_model_plan`
- explicit fallback to main/current model because Anthropic credits were unavailable

## Plan Draft A
- Add a temp-workspace-backed validator script `scripts/validate-extension-unit-tests.sh`
- Add committed TypeScript test files under `tests/extension-units/`
- Copy only the targeted extension/config/policy files into a temp npm workspace
- Run `node --import tsx --test` over three focused test files:
  - `safe-bash.test.ts`
  - `till-done.test.ts`
  - `orchestration-helpers.test.ts`
- Wire the script into CI, static checks, README, and operator workflow
- Pros:
  - minimal repo-wide dependency footprint
  - consistent with existing validator/report pattern
  - bounded to HARNESS-037
- Cons:
  - test environment setup is a little more custom

## Plan Draft B
- Add a root `package.json` and permanent Node test setup for the repo
- Run tests directly from the repo with `tsx` or another runner
- Wire standard `npm test` into CI
- Pros:
  - simpler day-to-day direct invocation once installed
- Cons:
  - broader repo-surface change
  - more coupling than needed for this bounded harness slice
  - higher chance of scope widening beyond HARNESS-037

## Unified Plan
- Use Draft A
- Rationale:
  - it matches the repo’s existing validation-script conventions
  - it keeps HARNESS-037 bounded to harness extension tests instead of starting a broader Node workspace story
- Implementation outline:
  1. Add committed TypeScript unit tests under `tests/extension-units/`
  2. Add a validator-style runner script `scripts/validate-extension-unit-tests.sh`
  3. Start with RED by running the new script before tests exist / before the suite passes
  4. Implement the smallest tests and any minimal testability adjustments needed in extension code
  5. Wire the new validator into static checks, CI, README, operator docs, and file map
  6. Run the unit-test validator to GREEN
  7. Run it repeatedly for flake coverage, then run cheap gates and skeptical review

## Files to Modify
- `.pi/agent/extensions/safe-bash.ts` (only if minimal testability adjustments are needed)
- `.pi/agent/extensions/till-done.ts` (only if minimal testability adjustments are needed)
- `.pi/agent/docs/operator_workflow.md`
- `.pi/agent/docs/file_map.md`
- `scripts/check-repo-static.sh`
- `.github/workflows/ci.yml`
- `README.md`
- `logs/CURRENT.md`
- `logs/coding/2026-04-20_harness-037-extension-unit-tests.md`
- `reports/planning/2026-04-20_harness-037-extension-unit-tests-plan.md`

## New Files
- `tests/extension-units/safe-bash.test.ts`
- `tests/extension-units/till-done.test.ts`
- `tests/extension-units/orchestration-helpers.test.ts`
- `scripts/validate-extension-unit-tests.sh`
- `reports/validation/2026-04-20_extension-unit-tests-validation-script.md`
- `reports/validation/2026-04-20_extension-unit-tests-validation-script.json`

## TDD Sequence
- 1. Create the validator script and test-file skeletons
- 2. Run the validator and confirm RED for the right reason (missing tests and/or failing assertions)
- 3. Add the smallest safe-bash behavior tests and make them pass
- 4. Add the smallest till-done behavior tests and make them pass
- 5. Add helper-level routing/team/packet/handoff tests and make them pass
- 6. Refactor minimally if test setup needs shared helpers
- 7. Re-run the unit-test validator and then fast local gates

## Test Coverage
- `safe-bash.ts`
  - protected write blocked
  - hard-block bash command blocked
  - warn-level command blocked in non-interactive mode
  - safe command path allowed
- `till-done.ts`
  - mutation blocked without active runnable task
  - implementation task cannot complete without validation
  - docs task can validate via lighter review path and complete
  - mutation allowed while active runnable task exists
- orchestration helpers
  - routing resolves expected model for a bounded case
  - team activation resolves expected initial team/sequence for a representative case
  - task packet generation produces valid packet shape
  - handoff generation preserves packet/evidence structure for a representative handoff

## Acceptance Criteria
- committed unit-test files exist for the targeted extension surfaces
- a dedicated extension-unit validator exists and passes locally
- CI runs the extension unit-test validator
- static checks require the new validator script
- evidence artifacts are written under `reports/validation/`
- HARNESS-037 is closed for the current bounded slice without widening into HARNESS-038

## Wiring Checks
| Component | Entry Point | Registration Location | How to Verify |
|---|---|---|---|
| extension unit-test validator | `./scripts/validate-extension-unit-tests.sh` | `scripts/check-repo-static.sh` and `.github/workflows/ci.yml` | script passes locally and CI runs it |
| safe-bash runtime behavior tests | `tests/extension-units/safe-bash.test.ts` | validator script test suite | validator output shows safe-bash test file pass |
| till-done runtime behavior tests | `tests/extension-units/till-done.test.ts` | validator script test suite | validator output shows till-done test file pass |
| helper-level orchestration tests | `tests/extension-units/orchestration-helpers.test.ts` | validator script test suite | validator output shows helper test file pass |

## Validation
- primary validator:
  - `./scripts/validate-extension-unit-tests.sh`
- supporting gates:
  - `./scripts/check-repo-static.sh`
  - `git diff --check`
  - `bash -n scripts/*.sh`
- save artifacts under:
  - `reports/validation/2026-04-20_extension-unit-tests-validation-script.md`
  - `reports/validation/2026-04-20_extension-unit-tests-validation-script.json`
- flake target:
  - 3 consecutive passing runs of the extension unit-test validator scope

## Risks
- fake `ExtensionAPI` scaffolding could become more complex than planned if extension internals are too tightly coupled to runtime services
- introducing large testability refactors would widen scope and should be avoided
- temp-workspace-based tests must copy the right repo assets so path-dependent behavior remains representative

## Pi Log Update
- planning log: `reports/planning/2026-04-20_harness-037-extension-unit-tests-plan.md`
- coding log: `logs/coding/2026-04-20_harness-037-extension-unit-tests.md`
