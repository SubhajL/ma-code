# Graphify Runtime Command Plan

## Discovery Path
- Read `AGENTS.md`, `README.md`, `logs/CURRENT.md`, and `g-planning` guidance.
- Used bounded `auggie_discover` first; it timed out and recommended local fallback.
- Local fallback inspected `.pi/agent/extensions/graphify-adapter.ts`, `.pi/agent/extensions/graphify-orchestration-decision.ts`, `tests/extension-units/test-utils.ts`, existing Graphify tests, validator scripts, and Graphify docs.
- Used `second_model_plan`; it agreed on a bounded command composing the decision helper and existing adapter, with tests and validator wiring. The second model assumed package paths that do not exist here, so repo-local `.pi/agent/extensions` paths are used instead.

## Goal
- Add a bounded Pi runtime command/tool that uses the existing `graphify_adapter` to execute the next safe Graphify orchestration step selected by `decideGraphifyOrchestration`.

## Non-Goals
- Do not reimplement Graphify adapter scan/query/freshness/preflight logic.
- Do not enable Graphify CLI `--watch`, daemon, MCP, hooks, Neo4j push, or background operation.
- Do not make Graphify globally mandatory.
- Do not directly edit `.pi/agent/state/runtime/*.json`.
- Do not add hidden scheduled loops or free-running queue behavior.

## Assumptions
- The runtime surface should be another Pi tool under `.pi/agent/extensions`, not a package-level CLI command.
- The new tool can register/capture the existing `graphify_adapter` internally so it can be loaded standalone.
- Execution should be at most one adapter action per call, returning visible decision and adapter evidence.

## Cross-Model Check
- `second_model_plan` recommended a command that calls `decideGraphifyOrchestration`, conditionally calls `graphify_adapter`, avoids `--watch`, adds unit tests, registers the command, and runs existing validators.
- Adjustment: this repo uses repo-local Pi extensions and tool registration, so implement `.pi/agent/extensions/graphify-orchestrator.ts` plus `tests/extension-units/graphify-orchestrator.test.ts` rather than package command files.

## Plan Draft A
- Add a new `graphify-orchestrator.ts` runtime extension/tool.
- Internally register/capture existing `graphify_adapter` and call its `execute` method for exactly one action mapped from the orchestration decision.
- Wire compile/unit/Graphify/static validators to include it.
- Pros: real runtime command, reuses adapter, keeps orchestration separate.
- Cons: one more extension file and tests.

## Plan Draft B
- Extend `graphify-adapter.ts` with a new `action: "orchestrate"`.
- Reuse existing adapter tests/validator wiring.
- Pros: fewer files and no captured-tool pattern.
- Cons: mixes low-level adapter actions with policy orchestration and makes adapter schema broader.

## Unified Plan
- Use Draft A: a separate runtime command/tool keeps adapter primitives and orchestration policy layered.
- Expose tool name `run_graphify_orchestration`.
- Input includes orchestration need, source/task/purpose/cadence/preflight/query/approval proof fields, and optional safe adapter parameters.
- Output includes the pure decision and, when applicable, one existing `graphify_adapter` result.
- Map decisions to adapter actions:
  - `run_preflight` -> `graphify_adapter` `preflight`
  - `run_scan` -> `graphify_adapter` `scan`
  - `check_freshness` -> `graphify_adapter` `freshness`
  - `query_graph` -> `graphify_adapter` `query`
  - non-executing decisions return guidance only

## Files to Modify
- `scripts/check-foundation-extension-compile.sh`
- `scripts/validate-extension-unit-tests.sh`
- `scripts/validate-graphify-discovery.sh`
- `scripts/check-repo-static.sh`
- `.pi/agent/docs/graphify_adapter.md`
- `README.md`
- `logs/CURRENT.md`

## New Files
- `.pi/agent/extensions/graphify-orchestrator.ts`
- `tests/extension-units/graphify-orchestrator.test.ts`
- `reports/planning/2026-05-04_graphify-runtime-command-plan.md`
- `logs/coding/2026-05-04_graphify-runtime-command.md`

## TDD Sequence
1. Add `tests/extension-units/graphify-orchestrator.test.ts` importing/registering the missing runtime extension.
2. Run the targeted test and confirm RED fails for missing module/tool.
3. Implement the smallest `run_graphify_orchestration` extension to pass the first behavior.
4. Add one behavior at a time for preflight, scan, freshness, query, guidance-only, and no-watch safety.
5. Refactor only after GREEN and rerun targeted tests after refactor.
6. Wire validators/static checks and rerun fast gates.

## Test Coverage
- Tool registration exposes `run_graphify_orchestration`.
- Missing graph/broad discovery delegates to existing `graphify_adapter` `preflight`.
- Preflighted missing graph delegates to existing `graphify_adapter` `scan` with token.
- Stale graph delegates to existing `graphify_adapter` `freshness`.
- Fresh unqueried graph delegates to existing `graphify_adapter` `query`.
- Dirty worktree or exact verification returns local-verification guidance without adapter call.
- Forbidden `--watch` remains blocked by adapter when passed through safe args.

## Acceptance Criteria
- Runtime command/tool exists and is executable through Pi extension registration.
- It uses the existing `graphify_adapter` implementation for adapter actions.
- It uses/respects `decideGraphifyOrchestration` for next-action selection.
- It executes at most one bounded adapter action per call.
- It does not enable Graphify CLI watch/daemon/background behavior.
- Relevant validators pass and the change is merged to `main`, then local `main` is synced.

## Wiring Checks
| Component | Runtime entry point | Registration | Schema/table | Verification |
| --- | --- | --- | --- | --- |
| `graphify-orchestrator.ts` | `run_graphify_orchestration` Pi tool | `pi.registerTool` in new extension; internally captures existing `graphify_adapter` | TypeBox tool parameter schema only; no DB/runtime JSON | unit test FakePi registration, foundation compile, Graphify validator compile/unit, static checker references |
| Existing `graphify_adapter` reuse | captured tool execute call | internal collector calls existing `graphifyAdapter` default export | existing adapter schema | tests assert adapter result/status and no reimplementation; static checker requires import/reference |

## Validation
- `npx --yes tsx --test tests/extension-units/graphify-orchestrator.test.ts`
- `bash scripts/check-foundation-extension-compile.sh`
- `bash scripts/validate-extension-unit-tests.sh --report /tmp/graphify-runtime-command-ext.md --summary-json /tmp/graphify-runtime-command-ext.json`
- `bash scripts/validate-graphify-discovery.sh --report /tmp/graphify-runtime-command-graphify.md --summary-json /tmp/graphify-runtime-command-graphify.json`
- `bash scripts/check-repo-static.sh`
- `git diff --check`
- PR gate after push: `npx --yes tsx scripts/harness-pr-gate.ts --pr <PR> --once`
- Post-merge sync: `npx --yes tsx scripts/harness-sync-main.ts --json`

## Risks
- Capturing a registered tool could drift from the real Pi extension API; mitigate with simple local collector and compile tests.
- Mapping a decision to the wrong adapter action could cause unintended scan; mitigate with tests and at-most-one-action design.
- Passing unsafe args could bypass safety; mitigate by relying on existing adapter forbidden-arg guards and testing `--watch` remains blocked.
- Generated artifacts are ignored but still side effects for scan tests; use fake/temp repos only.

## Pi Log Update
- Planning log: `reports/planning/2026-05-04_graphify-runtime-command-plan.md`
- Coding log: `logs/coding/2026-05-04_graphify-runtime-command.md`
