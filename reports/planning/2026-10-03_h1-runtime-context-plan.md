# H1 runtime-context correctness implementation plan

- Date: 2026-10-03
- Task: `task-1791033565049`
- Branch/worktree: `fix/h1-runtime-context` at `/Users/subhajlimanond/dev/ma-code-h1-runtime-context`
- Base: `origin/main` at `493bb70911734e1cdab809c37878c225130f20f4`
- Intake: approved stabilization plan `reports/planning/2026-10-03_harness-stabilization-pr-sessions-plan.md` exists in the operator worktree; this PR-local plan is the implementation contract.

## Discovery Path

- Loaded `g-planning`, `g-coding`, `g-check`, `g-create`, and `g-submit`.
- Auggie timed out under the two-second bound; used exact source/test inspection.
- Verified `safe-bash.ts` currently uses `dirname(targetPath)` for Git, task, branch, and audit context.
- Verified `appendAuditEntry(cwd, ...)` opens SQLite and JSONL relative to the supplied path, so passing a nested target parent creates nested state.
- Verified `FakePi` supports `--git-common-dir` but not `--show-toplevel`.
- Graphify was not used because the target seam is small and known.

## Goal

- Resolve explicit session repo, target worktree, control-plane, execution, and target-path context before safe-bash task/audit/branch decisions.
- Use the target worktree root as the control-plane root for same-family worktrees.
- Support target parents that do not exist yet.

## Non-Goals

- No deletion, migration, or reading of existing nested runtime databases.
- No shell-classifier, routing, queue, task-schema, or audit-schema redesign.
- No weakening of protected-path or cross-repository rejection.
- No generic repository framework beyond the safe-bash boundary.

## Assumptions

- Git `--show-toplevel` identifies each worktree root.
- Git `--git-common-dir` identifies same-repository worktree families.
- The nearest existing directory is used only for Git discovery; state and audit use the resolved control-plane root.
- Failure to resolve session or target Git context remains fail-closed.

## Cross-Model Check

- A second model preferred a dedicated resolver over private safe-bash-only helpers.
- Adopted: typed resolver, target worktree as control-plane root, FakePi `--show-toplevel` support.
- Rejected: hallucinated package paths, shelling out to `ls`, and a non-Git fallback to execution cwd. Direct source paths are used; filesystem `stat` finds the nearest existing ancestor; unresolved Git context blocks.

## Plan Draft A

- Add `.pi/agent/extensions/lib/runtime-context.ts` with filesystem and injected-Git discovery.
- Return explicit `repoRoot`, `worktreeRoot`, `controlPlaneRoot`, `executionCwd`, `targetPath`, and `gitCommonDir`.
- Unit-test the resolver and wire it into write/edit and leading-cd bash paths.
- Benefit: explicit contract and direct unit tests.

## Plan Draft B

- Keep resolver logic private in `safe-bash.ts` and only replace nested `targetCwd` uses.
- Benefit: fewer files.
- Rejected: context semantics remain coupled to one event handler and are harder to test across new-parent/worktree cases.

## Unified Plan

- Add the first public-behavior tracer to `safe-bash.test.ts`: a nested write uses the worktree root audit store and creates no nested audit/runtime store.
- Run the tracer and record RED from current nested-parent behavior.
- Add `--show-toplevel` support and configurable top-level roots to `FakePi`.
- Add the smallest typed resolver using `stat` to find the nearest existing directory and injected Git queries for top-level/common-dir.
- Wire write/edit paths:
  - protect the final resolved destination;
  - compare session and target Git common dirs;
  - use target worktree root for branch/status/auto-branch;
  - use target control-plane root for task and audit persistence;
  - retain execution/target metadata in audit entries.
- Wire leading-cd bash paths to the same worktree/control-plane semantics.
- Add behavior slices for nonexistent parents, sibling worktrees, main auto-branch task lookup, protected destination, and cross-repo rejection.
- Refactor only while GREEN.

## Files to Modify

- `.pi/agent/extensions/safe-bash.ts`
- `tests/extension-units/safe-bash.test.ts`
- `tests/extension-units/test-utils.ts`
- `logs/CURRENT.md`
- `logs/coding/2026-10-03_h1-runtime-context.md`
- `reports/planning/2026-10-03_h1-runtime-context-plan.md`

## New Files

- `.pi/agent/extensions/lib/runtime-context.ts`
- `tests/extension-units/runtime-context.test.ts` only if direct helper tests add behavior not already proven through safe-bash.

## TDD Sequence

1. Add one nested-write tracer test through the `tool_call` public handler.
2. Run it alone and confirm RED because audit/state is rooted under the target parent.
3. Implement the minimum resolver and write/edit wiring for GREEN.
4. Add one edge behavior at a time: nonexistent parent, sibling worktree, main auto-branch, leading-cd bash.
5. Keep protected/cross-repo regressions GREEN.
6. Run the targeted scope three consecutive times, then extension tests and typecheck.

## Test Coverage

- Existing nested target directory.
- Not-yet-existing target parent resolved through nearest existing ancestor.
- Same Git common-dir with distinct target worktree root.
- Target main worktree with active task at its root.
- Protected target and cross-repo target remain blocked.
- Leading-cd mutating bash audits at the target worktree root.

## Acceptance Criteria

- Nested write/edit and leading-cd paths use the resolved target worktree/control-plane root.
- No new nested `.pi/agent/state/runtime/pi.db` or nested `logs/harness-actions.jsonl` is created by tested operations.
- Separate worktrees remain distinguishable although they share a Git common-dir.
- Auto-branch reads the active task and dirty state from the target worktree root.
- New-parent targets work without weakening final-destination protection.
- Existing nested runtime databases are untouched.

## Wiring Checks

| Component | Entry point | Registration | Proof |
|---|---|---|---|
| runtime-context resolver | safe-bash write/edit and leading-cd handlers | direct import from `safe-bash.ts` | non-test import plus public handler tests |
| task/branch context | `attemptAutoBranchOnMain` | existing safe-bash extension | target-root task and branch assertions |
| audit context | `appendAuditEntry` via `appendAuditLog` | existing audit store | root JSONL/SQLite exists; nested equivalents absent |

## Validation

- Tracer: `node --experimental-sqlite --import tsx --test --test-name-pattern "nested write uses worktree control-plane root" tests/extension-units/safe-bash.test.ts`
- Focused: `node --experimental-sqlite --import tsx --test tests/extension-units/safe-bash.test.ts tests/extension-units/runtime-context.test.ts`
- Flake check: focused scope three consecutive times.
- Broader: `npm run test:extensions`, `npm run typecheck`, `git diff --check`.
- Formal working-tree `g-check` before commit and PR creation.

## Risks

- Git path normalization and relative common-dir output can misidentify worktree families if resolved against the wrong directory.
- Auditing a cross-repo rejection must use the session control-plane root, never the rejected target.
- A missing parent search must terminate at filesystem root and remain fail-closed.
- The current original worktree is dirty; only the isolated H1 worktree may be staged or committed.

## Pi Log Update

- Planning log: `reports/planning/2026-10-03_h1-runtime-context-plan.md`
- Coding log: `logs/coding/2026-10-03_h1-runtime-context.md`
- Active pointer: `logs/CURRENT.md`
