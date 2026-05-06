# Planning Log — execution-leases-phase-1

- Date: 2026-05-06
- Scope: Add the bounded Phase 1 execution lease helper, schema, fresh runtime/template placeholders, and harness-package bootstrap proof.
- Status: ready
- Related coding log: `logs/coding/2026-05-06_execution-leases-phase-1.md`

## Goal
- Establish the lease boundary with a dedicated file-backed helper plus schema/bootstrap support, without changing queue/task/operator behavior yet.

## Scope
- Add `.pi/agent/extensions/execution-leases.ts` with load/normalize/prune/acquire/release/summarize exports.
- Add `leases.schema.json` plus fresh local/template `leases.json` placeholders.
- Wire `.pi/agent/package/harness-package.json` and bootstrap tests for the new generated runtime placeholder.
- Keep the slice additive and isolated from runtime orchestration behavior.

## Files to Create or Edit
- `.pi/agent/extensions/execution-leases.ts`
- `tests/extension-units/execution-leases.test.ts`
- `.pi/agent/state/schemas/leases.schema.json`
- `.pi/agent/state/runtime/leases.json`
- `.pi/agent/package/templates/runtime/leases.json`
- `.pi/agent/package/harness-package.json`
- `tests/integration/harness-package.test.ts`
- `scripts/check-foundation-extension-compile.sh`
- `scripts/validate-extension-unit-tests.sh`
- `scripts/check-repo-static.sh`
- `scripts/validate-harness-package.sh`
- `logs/CURRENT.md`
- `logs/coding/2026-05-06_execution-leases-phase-1.md`

## Why Each File Exists
- `execution-leases.ts`: bounded lease helper exports for later phases to consume.
- `execution-leases.test.ts`: behavior-first proof for lease semantics.
- `leases.schema.json`: explicit runtime state shape contract.
- runtime/template `leases.json`: fresh placeholder state for source repo and bootstrapped repos.
- `harness-package.json`: generated runtime placeholder manifest entry.
- `harness-package.test.ts`: bootstrap proof for generated `leases.json` content.
- compile/unit/static/package validators: keep the new helper/test/schema wired into the existing cheap quality gates.

## What Logic Belongs There
- File-backed lease state load/save helpers.
- State normalization and expired-lease pruning.
- Conflict detection for active lease acquire.
- Release and summary helpers.
- No Pi tool registration in this phase.

## What Should Not Go There
- No queue-session enforcement.
- No operator surface or rendered lease UI.
- No multi-worker/worktree lane coordination behavior.
- No lease history/lifecycle expansion beyond active records needed for this phase.

## Dependencies
- Existing repo-local bootstrap flow in `scripts/harness-package.ts`.
- Existing extension compile and unit validators.
- Existing harness-package integration test and validator.

## Acceptance Criteria
- Lease helper exists and is independently testable.
- Lease schema exists and defines version `1` with a strict lease-record array shape.
- Fresh runtime placeholder exists in the worktree repo runtime and package template path with `{ "version": 1, "leases": [] }`.
- Harness package manifest includes generated `.pi/agent/state/runtime/leases.json`.
- Bootstrapped repos generate valid `.pi/agent/state/runtime/leases.json` placeholder content.
- No queue/task/operator runtime behavior changes land in this phase.

## Likely Failure Modes
- Helper fails when lease file is missing instead of normalizing to default state.
- Expired leases remain active because prune logic is skipped before acquire.
- Conflict logic is too weak and allows overlapping active leases for the same scope.
- Bootstrap manifest/template drift causes fresh target repos to miss `leases.json`.
- Validator wiring misses the new extension/test and gives false confidence.

## Validation Plan
- RED/GREEN in `tests/extension-units/execution-leases.test.ts`.
- RED/GREEN in `tests/integration/harness-package.test.ts` for generated lease placeholder.
- `./scripts/validate-extension-unit-tests.sh`.
- `./scripts/check-foundation-extension-compile.sh`.
- `./scripts/validate-harness-package.sh`.
- `./scripts/check-repo-static.sh`.
- `git diff --check`.

## Recommended Next Step
- Start with the failing extension-unit test for load/acquire/release/prune semantics, then implement the smallest file-backed helper that makes it pass before touching bootstrap wiring.
