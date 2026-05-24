# Coding Log: tier2-collapse-orchestrator-fsm

## Active Task

- Task: `task-tier2-collapse-orchestrator-fsm`
- Title: Tier 2 item 5: Collapse orchestrator FSM
- Owner: codex
- Status at planning start: in_progress
- Branch/worktree: `task/tier2-collapse-orchestrator-fsm` at `/Users/subhajlimanond/dev/ma-code-tier2-collapse-orchestrator-fsm`

Acceptance criteria:
- Replace the large command-specific orchestrator CLI branching with a smaller command registry/dispatcher while preserving all existing public CLI commands and safety semantics.
- Keep apply/run/continue/evidence/merge behavior wired to the existing extension entry points with no new raw shell merge or unsafe generic command path.
- Add or update tests that fail on the old large FSM shape and cover preserved CLI behavior for representative command groups.
- Run relevant orchestrator validators/tests plus scoped type/static checks and record passing evidence.
- Create a PR, merge it to origin/main with admin authorization when gates pass, and land local main at the merged commit.

## Planning Discovery

Auggie semantic search was attempted for the orchestrator FSM and returned HTTP 429, so this plan is based on direct file inspection and exact-string searches. Inspected files:
- `AGENTS.md`
- `docs/initiatives/harness-cleanup/architectural-review.md`
- `scripts/harness-orchestrate.ts`
- `.pi/agent/extensions/orchestrator-apply-policy.ts`
- `.pi/agent/extensions/orchestrator-dry-run.ts`
- `.pi/agent/extensions/orchestrator-run.ts`
- `.pi/agent/extensions/orchestrator-continue.ts`
- `.pi/agent/extensions/till-done.ts`
- `tests/extension-units/orchestrator-run.test.ts`
- `tests/extension-units/orchestrator-dry-run.test.ts`
- `tests/extension-units/orchestrator-apply-policy.test.ts`
- `tests/integration/orchestrator-run.test.ts`
- `tests/integration/orchestrator-apply.test.ts`
- `tests/integration/orchestrator-continue.test.ts`

## Plan Draft A - Registry In Place

### Overview

Collapse `scripts/harness-orchestrate.ts` by replacing the top-level command-specific parser and executor cascade with a single command registry. Each registry entry owns parsing, execution, rendering, and exit-code policy for one public command while the existing extension modules remain the runtime implementation.

### Files To Change

- `scripts/harness-orchestrate.ts`: Add exported command registry and route parsing/execution through it.
- `tests/extension-units/orchestrator-cli-dispatch.test.ts`: Add parser/registry coverage that fails before the registry exists.
- `coding-logs/2026-05-24-14-11-01 Coding Log (tier2-collapse-orchestrator-fsm).md`: Record plan, TDD evidence, review, validation, and merge evidence.
- `.codex/coding-log.current`: Point to this coding log.

### Implementation Steps

TDD sequence:
1. Add `tests/extension-units/orchestrator-cli-dispatch.test.ts` importing `ORCHESTRATE_COMMANDS` and representative parser paths.
2. Run the new test and confirm it fails because `ORCHESTRATE_COMMANDS` is not exported.
3. Add command parser helpers and `ORCHESTRATE_COMMANDS` in `scripts/harness-orchestrate.ts`.
4. Replace `main()`'s if-chain with registry execution while preserving output and exit codes.
5. Run targeted orchestrator unit/integration tests, validators, and static/type checks.

Functions:
- `parseHarnessOrchestrateArgs(argv)`: Use the registry to validate top-level command names and delegate command-specific parsing.
- `parseContextCommand(rest)`: Parse context-only options without reaching unrelated command state.
- `parseEvidenceCommand(rest)`: Parse evidence options and require `--initiative`.
- `parseMergeCommand(command, rest)`: Parse merge-check and merge-apply options and keep merge-apply approval enforcement downstream.
- `parseApplyCommand(rest)`: Parse allowlisted apply paths and reject unsafe apply/run/merge flags.
- `parseRunCommand(rest)`: Parse bounded run options, auto-land flags, and merge method.
- `parseContinueCommand(rest)`: Parse bounded continuation options and auto-land flags.
- `executeHarnessOrchestrate(options)`: Dispatch through the registry and return normalized output text/JSON result/exit code.

### Test Coverage

- `orchestrator-cli-dispatch.test.ts`: registry lists all public commands.
- `orchestrator-cli-dispatch.test.ts`: parser delegates representative command groups.
- `orchestrator-cli-dispatch.test.ts`: unsafe top-level verbs remain rejected.
- Existing `orchestrator-run.test.ts`: run auto-land behavior preserved.
- Existing `orchestrator-apply.test.ts`: apply allowlist behavior preserved.
- Existing `orchestrator-continue.test.ts`: continuation wiring preserved.

### Decision Completeness

Goal: Collapse the orchestrator CLI FSM without changing the public orchestrator contract.

Non-goals:
- Do not rename public commands, flags, output JSON fields, or extension APIs.
- Do not move provider abstractions, phase numbering, or validator runner logic.
- Do not change merge safety policy beyond preserving current behavior.

Success criteria:
- New registry test fails before implementation and passes after.
- Existing orchestrator validators pass.
- `harness-orchestrate.ts` top-level execution no longer has a command-by-command if cascade.
- PR is created, merged to `origin/main`, and local `main` lands at the merged commit.

Public interfaces:
- APIs/endpoints: none.
- CLI flags/commands: unchanged for `classify`, `context`, `dry-run`, `apply`, `run`, `continue`, `evidence`, `merge-check`, `merge-apply`.
- Env vars: none.
- DB/schema/migrations: none.

Edge cases / failure modes:
- Unknown command: fail closed with usage.
- Unsafe top-level verbs (`create`, `merge`, `sync-main`, `git`): fail closed through existing unsafe verb rejection.
- Missing required flags: fail closed with existing error text.
- Blocked delegated run/evidence: keep current nonzero exit policy.
- JSON/text output: preserve newline and renderer behavior.

Rollout and monitoring:
- No feature flag needed; this is an internal CLI refactor.
- Backout is revert of the PR.
- Watch CI and orchestrator validation scripts.

Acceptance checks:
- `node --import /Users/subhajlimanond/dev/ma-code/node_modules/tsx/dist/loader.mjs --test tests/extension-units/orchestrator-cli-dispatch.test.ts`
- `npm run validate:orchestrator-run`
- `npm run validate:orchestrator-continue`
- `npm run validate:orchestrator-apply`
- `npm run validate:orchestrator-dry-run`
- `npm run validate:orchestrator-evidence`
- `npm run validate:orchestrator-context`
- `npm run typecheck` or document the known baseline if it still fails.

### Dependencies

- Existing `tsx` install from the primary checkout is reused for the worktree because the worktree has no local `node_modules`.
- GitHub CLI and Graphite CLI are required for PR/merge workflow.

### Validation

Run the new unit test red/green, then run all orchestrator validators and a static/typecheck gate. Use compact Git/GitHub status checks before PR submission and merge.

### Wiring Verification

| Component | Entry Point | Registration Location | Schema/Table |
|---|---|---|---|
| `ORCHESTRATE_COMMANDS` | `parseHarnessOrchestrateArgs()` and `runFromArgv()` in `scripts/harness-orchestrate.ts` | Exported in the same CLI module; `scripts/lib/harness-dispatch.ts` already imports `harness-orchestrate.ts` in process | N/A |
| `orchestrator-cli-dispatch.test.ts` | Node test runner | Direct test command and orchestrator validator suite | N/A |

### Cross-Language Schema Verification

No DB migration or cross-language schema change. Runtime task state uses existing SQLite-backed task APIs only.

### Decision-Complete Checklist

- No open decisions remain.
- Public CLI surface is listed and unchanged.
- Behavior changes have tests that fail on missing registry/export and preserved parser behavior.
- Validation commands are specific and scoped.
- Wiring table covers the new registry and test.
- Rollout/backout is specified.

## Plan Draft B - Extract Parser Module

### Overview

Move all orchestrator CLI parsing and command metadata into a new `scripts/lib/harness-orchestrate-command-registry.ts`, leaving `scripts/harness-orchestrate.ts` as a thin runner. This makes parser logic reusable and keeps the CLI entrypoint smaller.

### Files To Change

- `scripts/lib/harness-orchestrate-command-registry.ts`: New registry, parser helpers, and execution metadata.
- `scripts/harness-orchestrate.ts`: Import registry and keep runtime helpers/renderers.
- `tests/extension-units/orchestrator-cli-dispatch.test.ts`: New registry tests.
- Coding log and pointer files.

### Implementation Steps

TDD sequence:
1. Add tests importing the new registry module.
2. Confirm failure because the module does not exist.
3. Extract parser definitions into the module.
4. Wire the CLI entrypoint to the module.
5. Run orchestrator validators and typecheck/static gates.

Functions:
- `getOrchestratorCommandDefinition(command)`: Return parser/executor metadata.
- `parseOrchestratorCommand(command, rest)`: Parse one command using metadata.
- `executeOrchestratorCommand(options, services)`: Execute with injected services.

### Test Coverage

- New module exports all public command definitions.
- Parser rejects unsafe verbs.
- Existing integration tests preserve CLI behavior.

### Decision Completeness

Goal and non-goals match Draft A.

Public interfaces remain unchanged.

Failure mode: new module increases import wiring risk; fail closed through tests and existing CLI validators.

Rollout/backout: revert PR.

### Dependencies

No new runtime dependency.

### Validation

Same as Draft A, plus import/wiring checks for the new module.

### Wiring Verification

| Component | Entry Point | Registration Location | Schema/Table |
|---|---|---|---|
| `harness-orchestrate-command-registry.ts` | Imported by `scripts/harness-orchestrate.ts` | Static ESM import | N/A |
| `orchestrator-cli-dispatch.test.ts` | Node test runner | Direct test command | N/A |

### Cross-Language Schema Verification

No schema change.

### Decision-Complete Checklist

- No open decisions remain.
- Public CLI unchanged.
- Wiring table covers the new module.

## Comparative Analysis

Draft A is smaller and reduces import churn by keeping the registry in the existing CLI file. It directly removes the top-level FSM shape while minimizing the blast radius.

Draft B creates a cleaner long-term boundary but adds a new module during a task whose acceptance is internal simplification, not module consolidation. That risks overlapping the next backlog item, "Consolidate small modules."

Both plans preserve the public CLI. Draft A better fits the narrow task and is less likely to create new module ownership or static-check problems.

## Unified Execution Plan

### Overview

Implement Draft A: add an exported in-file command registry to `scripts/harness-orchestrate.ts`, route parsing and execution through it, and leave existing extension modules untouched. This collapses the CLI FSM while keeping one bounded file change plus a focused unit test.

### Files To Change

- `scripts/harness-orchestrate.ts`: command registry, parser helpers, registry-based execution.
- `tests/extension-units/orchestrator-cli-dispatch.test.ts`: TDD coverage for registry and parser dispatch.
- `coding-logs/2026-05-24-14-11-01 Coding Log (tier2-collapse-orchestrator-fsm).md`: planning and evidence log.
- `.codex/coding-log.current`: current coding log pointer.

### Implementation Steps

TDD sequence:
1. Add `orchestrator-cli-dispatch.test.ts`.
2. Run it and record RED failure on missing `ORCHESTRATE_COMMANDS`.
3. Implement parser helpers and exported registry in `scripts/harness-orchestrate.ts`.
4. Replace `main()` command cascade with `executeHarnessOrchestrate(options)`.
5. Run new test, orchestrator validators, static check, and typecheck/baseline check.
6. Run `g-check` review on the working tree and fix any findings.
7. Submit PR, wait for/verify checks, merge with admin authorization, sync local `main`.

Functions:
- `ORCHESTRATE_COMMANDS`: Record of public command definitions.
- `parseGoalCommand(command, rest)`: Shared parser for `classify` and `dry-run`.
- `parseContextCommand(rest)`: Context parser.
- `parseEvidenceCommand(rest)`: Evidence parser.
- `parseMergeCommand(command, rest)`: Merge-check/apply parser.
- `parseApplyCommand(rest)`: Apply parser.
- `parseRunCommand(rest)`: Run parser.
- `parseContinueCommand(rest)`: Continue parser.
- `executeHarnessOrchestrate(options)`: Registry executor returning output, text, and exit code.

### Test Coverage

- `orchestrator CLI registry exposes every public command`: prevents fallback to ad hoc branches.
- `orchestrator CLI parser delegates representative command groups`: covers classify/context/apply/run/continue/evidence/merge.
- `orchestrator CLI parser rejects unsafe legacy verbs`: preserves fail-closed behavior.
- Existing integration suites: verify helper delegation and output semantics.

### Decision Completeness

Goal: Collapse the CLI FSM while preserving behavior.

Non-goals:
- No public CLI changes.
- No extension-module behavior changes.
- No schema, env, provider, phase-number, or validator-runner work.

Success criteria:
- Registry tests pass and would fail without the registry export.
- Existing orchestrator validators pass.
- Static/typecheck status is recorded.
- PR is merged to `origin/main`, and local `main` points at the merged commit.

Public interfaces:
- Commands and flags unchanged.
- JSON/text output unchanged.
- No API, DB, env, or schema changes.

Edge cases/failure modes:
- Unknown/unsafe commands fail closed.
- Missing values fail closed via `requireValue` and existing messages.
- Delegated helper failures preserve current nonzero exit handling.
- Text and JSON outputs retain trailing newline.

Rollout and monitoring:
- Internal CLI refactor; no feature flag.
- Backout by reverting PR.
- Watch local validators and GitHub CI.

Acceptance checks:
- New unit test RED then GREEN.
- `npm run validate:orchestrator-run`
- `npm run validate:orchestrator-continue`
- `npm run validate:orchestrator-apply`
- `npm run validate:orchestrator-dry-run`
- `npm run validate:orchestrator-evidence`
- `npm run validate:orchestrator-context`
- `npm run typecheck` or the repo's typecheck baseline gate, with exact result recorded.
- PR creation, merge, and local main sync evidence.

### Dependencies

- Existing Node/TypeScript toolchain.
- Existing GitHub/Graphite auth for PR and merge.

### Validation

Use the existing orchestrator validators as the primary behavior proof, plus the new unit test as the structural proof.

### Wiring Verification

| Component | Entry Point | Registration Location | Schema/Table |
|---|---|---|---|
| `ORCHESTRATE_COMMANDS` | `parseHarnessOrchestrateArgs()` and `executeHarnessOrchestrate()` | Same `scripts/harness-orchestrate.ts` module; invoked by direct CLI and `scripts/lib/harness-dispatch.ts` in-process dispatch | N/A |
| `executeHarnessOrchestrate()` | `main()` in `scripts/harness-orchestrate.ts` | Function call inside CLI entrypoint | N/A |
| `orchestrator-cli-dispatch.test.ts` | Node test runner | Direct validation command | N/A |

### Cross-Language Schema Verification

No DB or cross-language schema change.

### Decision-Complete Checklist

- No open decisions remain.
- Public interface changes: none, explicitly listed.
- Every behavior risk has test/validator coverage.
- Validation commands are scoped and concrete.
- Wiring table covers new registry and executor.
- Rollout/backout is specified.

## Implementation Summary (2026-05-24T14:23:14+0700)

Goal: collapse the orchestrator CLI FSM behind a command registry while preserving public commands, safety rules, and delegated helper behavior.

What changed:
- `scripts/harness-orchestrate.ts`: added `ORCHESTRATE_COMMANDS`, command-specific parser helpers, `executeHarnessOrchestrate()`, and registry-based `main()` dispatch. `apply` now strips the top-level CLI discriminator before calling `runOrchestratorApply()` so the apply policy does not confuse the public CLI command with the intentionally rejected generic apply `--command`.
- `tests/extension-units/orchestrator-cli-dispatch.test.ts`: added registry/parser coverage for public commands, representative command groups, and unsafe legacy verbs.
- `.codex/coding-log.current`: points to this coding log.

TDD evidence:
- RED: `NODE_PATH=/Users/subhajlimanond/dev/ma-code/node_modules node --import /Users/subhajlimanond/dev/ma-code/node_modules/tsx/dist/loader.mjs --test tests/extension-units/orchestrator-cli-dispatch.test.ts` failed because `scripts/harness-orchestrate.ts` did not export `ORCHESTRATE_COMMANDS`.
- GREEN: same command passed with 3 tests after adding the registry and parser dispatch.
- Regression found during validation: `npm run validate:orchestrator-apply` initially failed because the legacy apply request `command` property collided with the top-level `command` discriminator. Fixed by rejecting generic `--command` at parse time and stripping the top-level discriminator before apply-policy delegation.

Tests and validation run:
- `NODE_PATH=/Users/subhajlimanond/dev/ma-code/node_modules node --import /Users/subhajlimanond/dev/ma-code/node_modules/tsx/dist/loader.mjs --test tests/extension-units/orchestrator-cli-dispatch.test.ts` - PASS
- `NODE_PATH=/Users/subhajlimanond/dev/ma-code/node_modules TSX_IMPORT_PATH=/Users/subhajlimanond/dev/ma-code/node_modules/tsx/dist/loader.mjs npm run validate:orchestrator-run` - PASS
- `NODE_PATH=/Users/subhajlimanond/dev/ma-code/node_modules TSX_IMPORT_PATH=/Users/subhajlimanond/dev/ma-code/node_modules/tsx/dist/loader.mjs npm run validate:orchestrator-continue` - PASS
- `NODE_PATH=/Users/subhajlimanond/dev/ma-code/node_modules TSX_IMPORT_PATH=/Users/subhajlimanond/dev/ma-code/node_modules/tsx/dist/loader.mjs npm run validate:orchestrator-apply` - PASS
- `NODE_PATH=/Users/subhajlimanond/dev/ma-code/node_modules TSX_IMPORT_PATH=/Users/subhajlimanond/dev/ma-code/node_modules/tsx/dist/loader.mjs npm run validate:orchestrator-dry-run` - PASS
- `NODE_PATH=/Users/subhajlimanond/dev/ma-code/node_modules TSX_IMPORT_PATH=/Users/subhajlimanond/dev/ma-code/node_modules/tsx/dist/loader.mjs npm run validate:orchestrator-evidence` - PASS
- `NODE_PATH=/Users/subhajlimanond/dev/ma-code/node_modules TSX_IMPORT_PATH=/Users/subhajlimanond/dev/ma-code/node_modules/tsx/dist/loader.mjs npm run validate:orchestrator-context` - PASS
- `./scripts/check-repo-static.sh` - PASS
- `CODEX_ALLOW_LARGE_OUTPUT=1 git diff --check` - PASS
- Focused TypeScript check with `/tmp/ma-code-tier2-fsm-typecheck/tsconfig.json` resolved dependencies through the primary checkout and reported only existing `queue-runner.ts` baseline errors: `PacketRoutingSummary.thinking` at lines 2043 and 2073. No touched-file TypeScript errors were reported.

Wiring verification:
- `ORCHESTRATE_COMMANDS` is consumed by `parseHarnessOrchestrateArgs()` and `executeHarnessOrchestrate()`.
- `runFromArgv()` still calls the same CLI entrypoint, and `scripts/lib/harness-dispatch.ts` continues to import `harness-orchestrate.ts` in-process.
- Existing integration validators covered direct CLI and operator-wrapper entry points.

Behavior changes and risk notes:
- Public CLI commands and JSON/text output are unchanged.
- Generic `harness-orchestrate apply --command ...` now fails at parse time with the same safety intent instead of reaching apply-policy validation. This is fail-closed and keeps generic command strings unavailable.
- Worktree has untracked runtime task DB under `.pi/agent/state/runtime/`; it was created through the task tool path and is intentionally not part of the PR.

Known gaps:
- Full `npm run typecheck` was not run in the isolated worktree because there is no local `node_modules`, and creating one would modify the protected `node_modules` path. Focused `tsc` plus orchestrator validators were used instead.

## Review (2026-05-24T14:24:37+0700) - working-tree

### Reviewed

- Repo: `/Users/subhajlimanond/dev/ma-code-tier2-collapse-orchestrator-fsm`
- Branch: `task/tier2-collapse-orchestrator-fsm`
- Scope: working tree changes for orchestrator CLI registry, dispatch tests, and coding log pointer/log.
- Commands Run: `git status --porcelain=v1 --untracked-files=all`; `CODEX_ALLOW_LARGE_OUTPUT=1 git diff --name-only`; `CODEX_ALLOW_LARGE_OUTPUT=1 git diff --stat`; targeted inspection of `scripts/harness-orchestrate.ts` and `tests/extension-units/orchestrator-cli-dispatch.test.ts`; new unit test; all orchestrator validators; `./scripts/check-repo-static.sh`; `CODEX_ALLOW_LARGE_OUTPUT=1 git diff --check`; focused `tsc` over touched files.

### Findings

CRITICAL
- No findings.

HIGH
- No findings.

MEDIUM
- No findings.

LOW
- No findings.

### Open Questions / Assumptions

- Assumption: rejecting `harness-orchestrate apply --command ...` at parse time is acceptable because generic command strings were already intentionally forbidden and no public safe behavior depended on passing them deeper into the apply policy.
- Auggie semantic search was unavailable due HTTP 429; review used direct source/diff inspection and existing validators.

### Recommended Tests / Validation

- Completed: new registry unit test, orchestrator run/continue/apply/dry-run/evidence/context validators, repo static checks, and `git diff --check`.
- Residual gap: full repo `npm run typecheck` was not run in this isolated worktree because there is no local `node_modules`; focused `tsc` reported only existing `queue-runner.ts` baseline errors.

### Rollout Notes

- No feature flag or migration. This is an internal CLI refactor with unchanged public command names, flags, and JSON/text output.
- Backout is reverting the PR.
