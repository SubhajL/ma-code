# Tier 1 Typed Git Tools

## Planning Context

- Active task: `tier1-typed-git-tools`
- Branch/worktree: `task/tier1-typed-git-tools` in `/Users/subhajlimanond/dev/ma-code-tier1-typed-git-tools`
- Auggie semantic search: unavailable for this turn (`HTTP 429`), so this plan is based on direct file inspection plus exact-string searches.
- Inspected files: `AGENTS.md`, `.pi/SYSTEM.md`, `.pi/agent/extensions/safe-bash.ts`, `.pi/agent/extensions/git-commit.ts`, `.pi/agent/extensions/run-test.ts`, `.pi/agent/extensions/till-done.ts`, `tests/extension-units/safe-bash.test.ts`, `tests/extension-units/git-commit-tool.test.ts`, `tests/extension-units/test-utils.ts`, `docs/initiatives/harness-cleanup/tier-1-status.md`, `.pi/agent/extensions/safe-bash.spec.md`, `.pi/agent/docs/operator_workflow.md`, `package.json`.

## Plan Draft A - Three Focused Git Tool Modules

### Overview

Add one extension module each for `git_branch`, `git_checkout`, and `git_push`, following the existing `git_commit` and `run_test` pattern. Tighten `safe-bash` so bash invocations for those command shapes are blocked with typed-tool guidance.

### Files to Change

- `.pi/agent/extensions/git-branch.ts` - register and execute bounded branch operations.
- `.pi/agent/extensions/git-checkout.ts` - register and execute bounded switch/checkout operations.
- `.pi/agent/extensions/git-push.ts` - register and execute bounded non-force pushes.
- `.pi/agent/extensions/safe-bash.ts` - redirect typed command shapes.
- `tests/extension-units/git-branch-tool.test.ts` - validation/execution tests.
- `tests/extension-units/git-checkout-tool.test.ts` - validation/execution tests.
- `tests/extension-units/git-push-tool.test.ts` - validation/execution tests.
- `tests/extension-units/safe-bash.test.ts` - redirect and false-positive tests.
- `docs/initiatives/harness-cleanup/tier-1-status.md` - update Tier 1 status.

### Implementation Steps

TDD sequence:
1. Add tests for the new typed tools and safe-bash redirects.
2. Run focused tests and confirm RED for missing modules/redirects.
3. Implement the smallest tool and redirect changes to pass.
4. Refactor only if repeated validation/audit code becomes hard to follow.
5. Run focused tests, extension export test, and typecheck.

Functions:
- `validateGitBranchInput()` validates list/show/create operations and branch names.
- `executeGitBranch()` shells out only to bounded `git branch` forms and audits outcomes.
- `validateGitCheckoutInput()` validates branch switch/create inputs and explicit main override.
- `executeGitCheckout()` uses `git switch`, not raw checkout flags, and audits outcomes.
- `validateGitPushInput()` validates remote/branch inputs and refuses force/delete/main pushes.
- `executeGitPush()` pushes the current or explicit branch without force flags and audits outcomes.

### Test Coverage

- `validateGitBranchInput rejects delete action` - no destructive branch deletion surface.
- `executeGitBranch creates named branch` - bounded create command and audit.
- `executeGitCheckout refuses main by default` - main branch switch is explicit.
- `executeGitCheckout switches feature branch` - uses `git switch` safely.
- `executeGitPush refuses force/main` - no destructive/default-main push.
- `executeGitPush pushes current branch` - current branch lookup and audit.
- `safe-bash redirects git branch` - bash branch command blocked.
- `safe-bash redirects git checkout/switch` - checkout/switch blocked.
- `safe-bash redirects git push` - push blocked.
- `safe-bash false positives remain allowed` - checkout-index/branch-name unaffected.

### Decision Completeness

Goal: finish the remaining Tier 1 item 2 typed-git surface by covering `git_branch`, `git_checkout`, and `git_push`.

Non-goals: OS-level sandboxing, removing upstream bash, changing provider routing, changing runtime state storage, rewriting Graphite workflow.

Success criteria: tools are registered; safe-bash redirects the command shapes; tests pass; typecheck baseline does not regress; docs reflect closed Tier 1 status if evidence supports it.

Public interfaces: three new Pi extension tools (`git_branch`, `git_checkout`, `git_push`) and safer safe-bash guidance. No API endpoints, env vars, DB migrations, or CLI flags.

Edge cases / failure modes: invalid branch names fail closed; main checkout/push fail closed unless explicitly allowed for checkout; force/delete push is not exposed; git command failures return structured failed outcomes and audit entries.

Rollout & monitoring: extensions auto-load from `.pi/agent/extensions`; audit entries continue through `appendAuditEntry`; monitor `logs/harness-actions.jsonl` and SQLite `audit_log`.

Acceptance checks: focused tool tests pass, safe-bash tests pass, extension factory exports pass, `npm run typecheck` baseline remains known.

### Dependencies

Existing Pi extension loading, Node test runner, Typebox, and git CLI.

### Validation

Run focused unit tests first, then extension exports and typecheck.

### Wiring Verification

| Component | Entry Point | Registration Location | Schema/Table |
| --- | --- | --- | --- |
| `git_branch` | Pi typed tool call | `.pi/agent/extensions/git-branch.ts` default factory `pi.registerTool` | Typebox parameters, audit_log |
| `git_checkout` | Pi typed tool call | `.pi/agent/extensions/git-checkout.ts` default factory `pi.registerTool` | Typebox parameters, audit_log |
| `git_push` | Pi typed tool call | `.pi/agent/extensions/git-push.ts` default factory `pi.registerTool` | Typebox parameters, audit_log |
| safe-bash redirects | `pi.on("tool_call")` bash interceptor | `.pi/agent/extensions/safe-bash.ts` | audit_log |

## Plan Draft B - One Consolidated Git Tools Module

### Overview

Add one `git-tools.ts` extension module that registers all three tools. This keeps shared validation helpers and audit behavior in one file and avoids three mostly similar modules.

### Files to Change

- `.pi/agent/extensions/git-tools.ts` - register `git_branch`, `git_checkout`, and `git_push`.
- `.pi/agent/extensions/safe-bash.ts` - redirect now-typed git command shapes.
- `tests/extension-units/git-tools.test.ts` - shared validation/execution tests.
- `tests/extension-units/safe-bash.test.ts` - redirect and false-positive tests.
- `docs/initiatives/harness-cleanup/tier-1-status.md` - update Tier 1 status.

### Implementation Steps

TDD sequence:
1. Add consolidated tests for all three tools plus redirect tests.
2. Run focused tests and confirm RED for missing module/redirects.
3. Implement `git-tools.ts` with small exported validators/executors.
4. Keep helper functions private unless tests need explicit validation exports.
5. Run focused tests, extension export test, and typecheck.

Functions:
- `validateGitBranchInput()` validates action-specific branch inputs.
- `executeGitBranch()` performs show/list/create and audits.
- `validateGitCheckoutInput()` validates branch switching and main override.
- `executeGitCheckout()` performs `git switch` and audits.
- `validateGitPushInput()` validates non-force pushes.
- `executeGitPush()` performs `git push` and audits.
- `registerGitTool()` is not needed unless registration duplication becomes noisy.

### Test Coverage

- `git_branch registers bounded branch operations` - schema and execution coverage.
- `git_checkout refuses main unless explicit` - main guardrail.
- `git_push refuses force-shaped inputs` - destructive push unavailable.
- `safe-bash redirects typed git commands` - bash no longer used.
- `safe-bash keeps false positives allowed` - command-name boundaries hold.

### Decision Completeness

Goal: close the remaining typed-tool git coverage with the smallest cohesive change.

Non-goals: sandboxing, broad bash removal, typed wrappers for every shell command, Graphite replacement.

Success criteria: one auto-loaded extension registers all three tool names, safe-bash redirects matching bash commands, tests and typecheck evidence are recorded.

Public interfaces: new Pi tools `git_branch`, `git_checkout`, `git_push`; no DB schema or env change.

Edge cases / failure modes: invalid inputs fail closed before git execution; git failures are structured; main push is refused; main checkout requires explicit `allowMain`.

Rollout & monitoring: auto-loaded extension file plus audit log entries; no feature flag needed because safe-bash already blocks the matching bash surfaces.

Acceptance checks: `git-tools.test.ts`, `safe-bash.test.ts`, `extension-factory-exports.test.ts`, and typecheck.

### Dependencies

Existing extension auto-load convention and git CLI.

### Validation

Use focused local tests and existing typecheck. If the local worktree lacks `node_modules`, use the checked-out main repo dependency tree only for resolution, without writing `node_modules` in the worktree.

### Wiring Verification

| Component | Entry Point | Registration Location | Schema/Table |
| --- | --- | --- | --- |
| `git_branch` | Pi typed tool call | `.pi/agent/extensions/git-tools.ts` default factory `pi.registerTool` | Typebox parameters, audit_log |
| `git_checkout` | Pi typed tool call | `.pi/agent/extensions/git-tools.ts` default factory `pi.registerTool` | Typebox parameters, audit_log |
| `git_push` | Pi typed tool call | `.pi/agent/extensions/git-tools.ts` default factory `pi.registerTool` | Typebox parameters, audit_log |
| safe-bash redirects | `pi.on("tool_call")` bash interceptor | `.pi/agent/extensions/safe-bash.ts` | audit_log |

## Comparative Analysis

Draft A makes ownership obvious by command but adds three top-level extension files and repeats validation/audit plumbing. Draft B is easier to review as one bounded git-tool surface and avoids unnecessary module spread, while still registering explicit tool names.

Both drafts follow the repo constraints: active task exists, work is on a feature worktree, tests come first, safe-bash remains a guardrail rather than a sandbox, and audit logging remains visible. Draft B better matches the current Tier 2 direction to consolidate small modules where practical, without changing runtime behavior beyond the requested tool surface.

## Unified Execution Plan

### Overview

Implement Tier 1 item 2 as a consolidated `git-tools.ts` extension that registers `git_branch`, `git_checkout`, and `git_push`, then tighten `safe-bash` redirects for those bash command shapes. Update the Tier 1 tracker to reflect the current post-PR #198 progress and this PR's closure criteria.

### Files to Change

- `.pi/agent/extensions/git-tools.ts` - new typed git branch/checkout/push tools with validation, execution, and audit logging.
- `.pi/agent/extensions/safe-bash.ts` - new redirect patterns for `git branch`, `git checkout`, `git switch`, and `git push`.
- `tests/extension-units/git-tools.test.ts` - tests-first coverage for validators/executors.
- `tests/extension-units/safe-bash.test.ts` - tests-first redirect and false-positive coverage.
- `docs/initiatives/harness-cleanup/tier-1-status.md` - bring tracker current after PR #198 and this work.

### Implementation Steps

TDD sequence:
1. Add RED tests in `git-tools.test.ts` and `safe-bash.test.ts`.
2. Run focused tests and record failures for missing `git-tools.ts` exports/redirects.
3. Implement `git-tools.ts` with exported validators/executors and default factory registration.
4. Update `safe-bash.ts` typed redirect patterns.
5. Run focused tests, extension export test, package-relevant tests if needed, and typecheck.
6. Append implementation and review evidence to this coding log.

Functions:
- `validateGitBranchInput(input)` checks `show_current`, `list`, and `create`; `create` requires a safe branch name and exposes no delete path.
- `executeGitBranch(deps, input)` reads current/listed branches or creates a branch using bounded args and audits `shown`, `listed`, `created`, `failed`, or `blocked`.
- `validateGitCheckoutInput(input)` checks branch/create/startPoint and refuses main unless `allowMain` is true.
- `executeGitCheckout(deps, input)` uses `git switch`/`git switch -c`, returns prior/new branch, and audits.
- `validateGitPushInput(input)` checks remote/branch/setUpstream/dryRun and refuses main/force/delete-shaped values.
- `executeGitPush(deps, input)` resolves the current branch if needed and runs `git push` without force flags.
- `findTypedToolRedirect(command)` gains git branch/checkout/switch/push entries with word-boundary false-positive protection.

### Test Coverage

- `validateGitBranchInput rejects unsupported action` - fail closed.
- `executeGitBranch shows current branch` - current branch read path.
- `executeGitBranch creates branch with check-ref-format` - bounded creation.
- `executeGitCheckout refuses main by default` - main guardrail.
- `executeGitCheckout creates and switches branch` - bounded switch create.
- `executeGitPush refuses main branch` - direct main push blocked.
- `executeGitPush pushes current branch with upstream` - bounded push args.
- `safe-bash redirects git branch` - typed branch guidance.
- `safe-bash redirects git checkout and switch` - typed checkout guidance.
- `safe-bash redirects git push` - typed push guidance.
- `safe-bash does not redirect checkout-index/branch-name` - false-positive guard.

### Decision Completeness

Goal: close Tier 1 item 2's remaining high-value typed git surface after `git_commit` and `run_test` already landed.

Non-goals: remove upstream `bash`, add OS sandboxing, rewrite Graphite flows, type every possible shell command, or change runtime DB state.

Success criteria:
- `git_branch`, `git_checkout`, and `git_push` are registered by an auto-loaded extension.
- Bash command shapes for branch/checkout/switch/push are redirected to typed tools.
- Tests prove validation, execution, audit behavior, and false-positive boundaries.
- Typecheck baseline is unchanged or improved.
- Tier 1 tracker matches current reality: items 1, 3, 4 done; item 2 closed if this PR lands.

Public interfaces:
- New Pi tools: `git_branch`, `git_checkout`, `git_push`.
- No endpoint, CLI flag, env var, DB migration, or JSON schema change.

Edge cases / failure modes:
- Invalid branch/remote names fail closed before mutation.
- Main push fails closed.
- Main checkout fails closed unless the caller sets explicit `allowMain`.
- Force/delete push is impossible through parameters and still blocked by safe-bash.
- Git command failures return structured failures and audit entries instead of throwing raw stderr.

Rollout & monitoring:
- Auto-load via top-level extension module; no feature flag.
- Audit via `appendAuditEntry` keeps SQLite + JSONL visibility.
- Backout is deleting the new extension and redirect entries in one small revert.

Acceptance checks:
- `node --experimental-sqlite --test tests/extension-units/git-tools.test.ts`
- `node --experimental-sqlite --test tests/extension-units/safe-bash.test.ts`
- `node --experimental-sqlite --test tests/extension-units/extension-factory-exports.test.ts`
- `npm run typecheck`

### Dependencies

Existing git CLI, Pi extension registration, Typebox, and audit-log helper.

### Validation

Run focused tests first, then typecheck. Record RED/GREEN evidence and any known baseline failures.

### Wiring Verification

| Component | Entry Point | Registration Location | Schema/Table |
| --- | --- | --- | --- |
| `git_branch` | Pi typed tool call | `.pi/agent/extensions/git-tools.ts` default factory `pi.registerTool({ name: "git_branch" })` | Typebox parameters, SQLite/JSONL `audit_log` |
| `git_checkout` | Pi typed tool call | `.pi/agent/extensions/git-tools.ts` default factory `pi.registerTool({ name: "git_checkout" })` | Typebox parameters, SQLite/JSONL `audit_log` |
| `git_push` | Pi typed tool call | `.pi/agent/extensions/git-tools.ts` default factory `pi.registerTool({ name: "git_push" })` | Typebox parameters, SQLite/JSONL `audit_log` |
| safe-bash redirects | Pi bash `tool_call` interceptor | `.pi/agent/extensions/safe-bash.ts` default factory `pi.on("tool_call")` | SQLite/JSONL `audit_log` |

### Cross-Language Schema Verification

No DB migration is introduced. The only persisted data path is audit logging through the existing `appendAuditEntry` abstraction, which already dual-writes to SQLite and JSONL.

## Implementation Summary (2026-05-24 12:04:57 +07)

### Goal

Close Tier 1 item 2 by adding the remaining planned typed git tools (`git_branch`, `git_checkout`, `git_push`) and redirecting matching bash command shapes through `safe-bash`.

### What Changed

- `.pi/agent/extensions/git-tools.ts`: added a consolidated auto-loaded extension that registers `git_branch`, `git_checkout`, and `git_push`; each tool has Typebox parameters, bounded validation, structured outcomes, and audit-log writes.
- `.pi/agent/extensions/safe-bash.ts`: added typed-tool redirect patterns for `git branch`, `git checkout`/`git switch`, and `git push`.
- `tests/extension-units/git-tools.test.ts`: added unit tests for validation, execution behavior, audit fields, and tool registration.
- `tests/extension-units/safe-bash.test.ts`: added redirect tests and false-positive guards for similarly named git commands.
- `docs/initiatives/harness-cleanup/tier-1-status.md`: updated Tier 1 progress after PR #198 and documented item 2 as closed by the typed git surface expansion.

### TDD Evidence

RED:
- Command: `node --experimental-sqlite --import <dependency-resolver-data-url> --import /Users/subhajlimanond/dev/ma-code/node_modules/tsx/dist/loader.mjs --test tests/extension-units/git-tools.test.ts tests/extension-units/safe-bash.test.ts`
- Result: failed as expected. Key failures: missing `.pi/agent/extensions/git-tools.ts`; safe-bash redirect tests for `git branch`, `git checkout`/`git switch`, and `git push` returned `undefined` instead of a block.

GREEN:
- Command: `node --experimental-sqlite --import <dependency-resolver-data-url> --import /Users/subhajlimanond/dev/ma-code/node_modules/tsx/dist/loader.mjs --test tests/extension-units/git-tools.test.ts tests/extension-units/safe-bash.test.ts tests/extension-units/extension-factory-exports.test.ts`
- Result: 41 tests passed, 0 failed.

Typecheck:
- Command: `/Users/subhajlimanond/dev/ma-code/node_modules/.bin/tsc -p /tmp/ma-code-tier1-typed-git-tools-tsconfig.json`
- Result: passed for the new `git-tools.ts` and `git-tools.test.ts` slice.
- Project-wide command attempted: `/Users/subhajlimanond/dev/ma-code/node_modules/.bin/tsc --noEmit`
- Result: failed in the isolated worktree because there is no local `node_modules`, then continued into the known baseline type errors (`WorkerRunStepStatus`, `callerModelId`, `packet.routing.thinking`, and related pre-existing suite drift). No new `git-tools.ts` errors appeared in the targeted typecheck.

### Wiring Verification

- `git_branch`, `git_checkout`, and `git_push` are registered in `.pi/agent/extensions/git-tools.ts` through the default factory with `pi.registerTool`.
- `tests/extension-units/extension-factory-exports.test.ts` passed, proving the new top-level extension module exports the required default factory.
- `tests/extension-units/git-tools.test.ts` includes `git tools extension registers branch, checkout, and push tools`, proving all three tool names are registered and callable through the extension factory.
- `safe-bash.ts` redirects matching bash command shapes before execution and records normal safe-bash audit entries for blocked bash invocations.

### Behavior And Risk Notes

- `git_branch` supports `show_current`, `list`, and `create`; branch deletion is not exposed.
- `git_checkout` uses `git switch`; switching to `main` fails closed unless `allowMain=true`.
- `git_push` pushes only a current or explicit non-main branch; force/delete refspecs are not exposed and main pushes fail closed.
- Residual arbitrary bash remains possible for one-off shell utility calls. This is consistent with the Tier 1 inversion decision and still not a sandbox.

### Follow-ups / Known Gaps

- OS-level bash sandboxing remains a future architecture option, not part of this Tier 1 closure.
- The repository still has pre-existing project-wide typecheck baseline failures unrelated to this slice.

### Review-Driven Fixes

- During local review, found that `git_push` validated explicit branch inputs but also needed to validate the resolved current branch. Git accepts branch names beginning with `+`, which would be interpreted as a force refspec by `git push origin +branch`. Fixed by validating the resolved branch before push execution and added `executeGitPush rejects force-shaped current branch values`.
- Also preserved hard-block precedence in `safe-bash`: `git push --force` and `git branch -D` now hit existing destructive-command blocks before typed-tool redirect guidance. Added regression tests for both precedence cases.
- Latest focused validation after the fixes: `node --experimental-sqlite --import <dependency-resolver-data-url> --import /Users/subhajlimanond/dev/ma-code/node_modules/tsx/dist/loader.mjs --test tests/extension-units/git-tools.test.ts tests/extension-units/safe-bash.test.ts tests/extension-units/extension-factory-exports.test.ts` passed with 44 tests, 0 failed.
- Latest targeted typecheck after the fixes: `/Users/subhajlimanond/dev/ma-code/node_modules/.bin/tsc -p /tmp/ma-code-tier1-typed-git-tools-tsconfig.json` passed.

## Review (2026-05-24 12:08:00 +07) - working-tree

### Reviewed

- Repo: `/Users/subhajlimanond/dev/ma-code-tier1-typed-git-tools`
- Branch: `task/tier1-typed-git-tools`
- Scope: working tree at base `7552426`
- Commands Run: `git status --short`; `CODEX_ALLOW_LARGE_OUTPUT=1 git diff --stat`; targeted file reads for `.pi/agent/extensions/git-tools.ts`, `.pi/agent/extensions/safe-bash.ts`, and related tests; focused Node test command; targeted TypeScript command.
- Auggie: attempted for review context and failed with `HTTP 429`; review used direct file inspection plus exact identifier checks.

### Findings

CRITICAL
- No findings.

HIGH
- No findings.

MEDIUM
- No findings after fixes. During review, the resolved-current-branch `git_push` force-refspec issue was found and fixed before this report was finalized.

LOW
- No findings.

### Open Questions / Assumptions

- Assumption: Tier 1 item 2 is considered closed by typed surfaces for the planned high-frequency actions, while OS-level bash sandboxing remains a future architecture option rather than a Tier 1 acceptance requirement.

### Recommended Tests / Validation

- Keep the focused 44-test command in the PR evidence.
- Keep the targeted TypeScript check in PR evidence because the isolated worktree cannot run full `npm run typecheck` without writing a protected `node_modules` folder.
- Project-wide `tsc --noEmit` should be rerun in a normal dependency-installed checkout/CI; known baseline failures are unrelated to this slice.

### Rollout Notes

- New extension auto-loads from `.pi/agent/extensions/git-tools.ts`.
- `safe-bash` now preserves hard-block precedence before typed-tool redirects for force push and force branch deletion.
- Backout is a small revert of `git-tools.ts`, the redirect entries, tests, and the tracker update.
