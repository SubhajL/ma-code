# Fix CLI tsx Resolution and Root Worktree Cleanliness Plan

- Date: 2026-05-18
- Task: `task-1779103309353`
- Branch: `task/task-1779103309353-fix-worker-cli-tsx`

## Scope
- Preserve and clean the root worktree's pre-existing dirty task branch state without discarding changes.
- Fix the worker-execution CLI integration fixture so npm validation works from isolated worktrees without local `node_modules`.
- Submit a bounded PR if code changes are needed.

## Discovery
- Root worktree is on `task/task-1778982781898-confirm-greenfield-routing-mo-lanes-and-grill-em` with modified files:
  - `logs/coding/2026-05-16_greenfield-phase-c1-runtime-queue-proof.md`
  - `scripts/harness-merge.ts`
  - `tests/integration/merge-helper.test.ts`
- Clean synced main worktree exists at `/Users/subhajlimanond/dev/ma-code-worktrees/task-1779096877780-risk3`.
- Auggie discovery was unavailable due credits; local `rg`/read fallback found `tests/integration/worker-execution.test.ts` uses `repoRoot/node_modules/tsx/dist/loader.mjs` for child CLI invocations.

## TDD Slice
- RED: `npm run test:worker-execution` fails because the CLI child process imports `/worktree/node_modules/tsx/dist/loader.mjs`, which is absent in isolated worktrees.
- GREEN: resolve the `tsx` import path through Node's actual module resolver (`import.meta.resolve("tsx")`) before falling back to repo-local `node_modules`.

## Validation Plan
- `npm run test:worker-execution`
- `npm run validate:worker-execution`
- Relevant targeted worker-execution tests if needed.
- `git diff --check`
