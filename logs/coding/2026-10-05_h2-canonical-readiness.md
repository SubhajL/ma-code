# H2 Canonical SQLite Readiness

Task: task-1791192851704
Branch: fix/h2-canonical-readiness
Plan: reports/planning/2026-10-05_h2-canonical-readiness-plan.md

## Discovery
Three JSON readiness readers source-verified. Isolated worktree from merged PR #255; original dirty tree untouched. SQLite state initialization guard required to prevent stale exports introducing extra rows or pointers.

## RED / GREEN Evidence
- RED command: `node --test tests/extension-units/pr-lifecycle.test.ts` with temporary dependency-only NODE_OPTIONS. Converting fixtures to canonical SQLite caused expected readiness failures because the reader required tasks.json. GREEN: all 13 then 15 PR tests pass after consumer migration.
- RED command: `node --test tests/extension-units/canonical-state-authority.test.ts`. All four cases failed as stale JSON resurrected task/job IDs or metadata, including an empty canonical snapshot. GREEN: 4/4 after initialization guards.
- Slice fixtures are SQLite-only; explicit missing task ID cannot borrow another task's proof. AFK status reflects SQLite rather than contradictory queue JSON.
- Final focused command: `node --test tests/extension-units/canonical-state-authority.test.ts tests/extension-units/pr-lifecycle.test.ts tests/extension-units/slice-lifecycle.test.ts tests/extension-units/afk-orchestration.test.ts`: 47/47 three consecutive runs.
- Full command: `node --test $(find tests/extension-units -name '*.test.ts' | sort)`: 689/689.
- Core command: `node --test tests/integration/core-workflows.test.ts`: 10/10.
- Typecheck: `node /Users/subhajlimanond/dev/ma-code/node_modules/typescript/bin/tsc --noEmit -p TSCONFIG_WORKTREE.tmp.json`: pass. Temporary config only maps dependencies to the existing installation.
- Wiring: all three readiness readers now import canonical APIs; exact-string search finds no tasks.json/queue.json references in those consumers. Migration readers remain in state libraries with authority checks before import and after locking.

## Review (2026-10-05) - working-tree
### Reviewed
- Repo: /Users/subhajlimanond/dev/ma-code-h2-canonical-readiness
- Branch: fix/h2-canonical-readiness
- Scope: H2 consumer/state/test/log changes; runtime stores and temporary validation files excluded.
- Commands Run: `git status -sb`; `git diff --stat`; targeted `git diff -- .pi/agent/extensions/lib/tasks-state.ts .pi/agent/extensions/lib/queue-state.ts`; source/test inspection; the exact validation commands above; `git diff --check`.
### Findings
CRITICAL
- none
HIGH
- none
MEDIUM
- none
LOW
- none
### Open Questions / Assumptions
- The repo-root task is authoritative when found; fallback to worker worktree is for absent tasks only. Regression rejects borrowed passing worktree proof.
- SQLite singleton/row existence identifies initialization independently per entity, preserving genuine first-use migration.
- Stale JSON remains visible and ignored; no runtime-file cleanup or schema change.
- H3 synthetic review/status defaults are intentionally deferred to PR 5.
### Recommended Tests / Validation
- Keep absent-export readiness, stale nonempty/empty exports, explicit task selection, and legacy migration tests.
- No live provider validation needed.
### Rollout Notes
- Source-only rollback; no migration rollback. No changes to original dirty worktree.
Review Verdict: no_required_fixes

## Creation / Submission
- Graphite branch fix/h2-canonical-readiness; commit message: fix(lifecycle): read canonical SQLite readiness state.
- Explicit reviewed paths only; hooks not bypassed. Exact PR/merge identifiers recorded in task evidence after submission.
