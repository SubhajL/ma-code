# H7 Deliberate Recovery Composite Registration Plan

Date: 2026-10-03
Branch: `fix/h7-recovery-registration`
Task: `task-1791035657315`

## Goal

Keep `.pi/agent/extensions/recovery.ts` as a real composite entry point that registers both recovery tools, while making production-equivalent top-level extension auto-loading safe when it also invokes the split recovery factories.

## Provenance Resolution

The original dirty worktree contains an uncommitted experiment that:

- removes the split-factory imports from `recovery.ts`;
- makes the composite default export a no-op;
- changes recovery-runtime tests to call only the split runtime factory; and
- adds a top-level duplicate-registration tracer.

Those edits are not on merged `main` and must not be copied as an implementation. The duplicate-registration tracer expresses a valid missing contract, but the no-op composite violates existing consolidated-module and core-workflow contracts. This PR will recreate the test intent from clean merged `main` and solve the conflict through idempotent split registration.

## As-Is Wiring

- `recovery.ts` exports policy/runtime functions and deliberately calls both split default factories.
- `recovery-policy.ts` directly registers `resolve_recovery_policy` on every invocation.
- `recovery-runtime.ts` directly registers `resolve_recovery_runtime_decision` on every invocation.
- `consolidated-modules.test.ts` already proves direct composite loading exposes both tools.
- `extension-factory-exports.test.ts` verifies default exports exist, but does not invoke factories or reject duplicate recovery tool names.
- `core-workflows.test.ts` loads `recovery.ts` and requires both policy and runtime behavior.

Auggie discovery timed out, so these claims were verified directly in source and tests. A second-model pass agreed that the no-op composite is incorrect and recommended idempotent split factories rather than a global loader redesign.

## Design

1. Preserve the composite behavior in `recovery.ts` and document why it calls both split factories.
2. Give each split recovery module a module-local `WeakSet` keyed by `ExtensionAPI` instance.
3. A split factory returns early only after that same factory has successfully registered its tool on the same API instance.
4. Keep the guard local to recovery; do not create a global duplicate-suppression mechanism that could hide unrelated registration defects.
5. Add strict test APIs that fail on a second registration of the same tool name and expose registration counts.

The guard is order-independent: composite-first and split-first loading both result in one registration per recovery tool. `WeakSet` avoids mutating or retaining the host API object.

## TDD Slices

### RED 1 — production-equivalent top-level auto-load

Extend `tests/extension-units/extension-factory-exports.test.ts` to invoke every top-level extension default factory against a `FakePi` that rejects duplicate recovery tool names. Assert both recovery tool names are registered exactly once.

Expected clean-main failure: the sorted split factories register first, then `recovery.ts` invokes them again and the strict fake rejects the duplicate. A broader all-tool strict pass also exposed the pre-existing `packets.ts`/`task-packets.ts` duplicate; the final tracer keeps that unrelated baseline visible but scopes duplicate rejection to the two H7 recovery names rather than widening this PR.

### RED 2 — order-independent split/composite composition

Extend `tests/extension-units/consolidated-modules.test.ts` to call recovery factories in both orders on fresh strict fakes:

- composite, policy split, runtime split;
- policy split, runtime split, composite.

Expected clean-main failure: the second path to each tool registers a duplicate.

### GREEN

Add the smallest module-local successful-registration guards in `recovery-policy.ts` and `recovery-runtime.ts`. Keep the composite calls intact.

## Files

Expected production changes:

- `.pi/agent/extensions/recovery.ts`
- `.pi/agent/extensions/recovery-policy.ts`
- `.pi/agent/extensions/recovery-runtime.ts`

Expected tests:

- `tests/extension-units/consolidated-modules.test.ts`
- `tests/extension-units/extension-factory-exports.test.ts`

Evidence artifacts:

- `reports/planning/2026-10-03_h7-recovery-registration-plan.md`
- `logs/coding/2026-10-03_h7-recovery-registration.md`
- `logs/CURRENT.md`

## Acceptance Criteria

1. Direct default loading of `recovery.ts` exposes `resolve_recovery_policy` and `resolve_recovery_runtime_decision`.
2. Both split defaults still register their tool on a fresh API instance.
3. Composite-first and split-first invocation register each recovery tool exactly once per API instance.
4. Invoking every top-level extension factory in production-equivalent sorted order produces no duplicate recovery tool name and exactly one of each recovery tool.
5. The original dirty no-op composite is not modified, staged, stashed, or copied into this worktree.
6. Targeted tests pass three consecutive times; extension units, core workflows, typecheck, and diff checks pass.
7. Formal `g-check` ends with `Review Verdict: no_required_fixes` before creation/submission.
8. The bounded PR is admin-merged as explicitly requested, local `main` matches `origin/main`, and the isolated worktree is removed only after completion.

## Validation

- RED/GREEN targeted Node tests for consolidated modules and factory auto-load.
- Recovery policy/runtime focused tests.
- Three-run targeted flake check.
- Full extension-unit suite.
- Core workflow integration suite.
- TypeScript typecheck using the same source with isolated-worktree dependency resolution only.
- `git diff --check` plus explicit untracked-file whitespace check before staging.
- Wiring grep/diff review and formal `g-check`.

## Risks and Rollback

- A guard marked before a failed registration could suppress retries. Mark only after `pi.registerTool` returns successfully.
- A broad helper could mask unrelated duplicate bugs. Keep guards private to the two recovery modules.
- Module identity must be shared between static composite imports and dynamic split imports; ESM URL caching provides that identity in the supported loader path, and both loading orders are covered by tests.
- Rollback is limited to two guards, one composite comment, and the new tests; no state/schema migration is involved.
