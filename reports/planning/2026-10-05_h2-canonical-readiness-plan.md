# H2 Canonical SQLite Readiness Plan

Task: task-1791192851704
Base: merged PR #255, 263d52b

## Discovery
Auggie returned no useful targets; exact source confirms direct JSON readers in pr-lifecycle readTaskReady, slice-lifecycle loadTaskEvidence, and afk-orchestration readIssueQueueStatuses. Existing canonical APIs retain JSON migration. Second-model synthesis agreed with consumer migration; its broad test/doctor rewrite and archive-file authority proposal were rejected as unnecessary.

## Scope and Acceptance
- Replace the three readiness readers with canonical state APIs; task/job identifiers remain exact.
- PR readiness uses the control-plane task if present; only a missing task may fall back to the worker worktree. A failed canonical task must not borrow proof.
- Slice assessment uses an explicit bundle task ID, or the active task, never the first arbitrary task.
- Once a state singleton or canonical rows exist, JSON is import-only and cannot override or resurrect state. Check inside the import transaction for races.
- Keep genuine first-use migration, operator output, and H3 status semantics unchanged until PR 5.

## TDD
First tracer: convert PR fixtures to SQLite; create must succeed without exports and ignore stale contradictory JSON. RED expected: taskReady false with no tasks.json. Then slice and AFK status tracers, stale added-ID and empty-canonical import cases. Boundary mocks: git/GitHub runner only; real SQLite and temporary fixture files.

## Validation / Wiring
Three focused passes; full extension and core suites; typecheck; source search for JSON readiness reads; formal g-check, explicit staging, PR and admin merge, local-main landing.

## Risks / Rollback
No schema changes. Initialization is identified by entity singleton/rows, not database file existence, allowing tasks-first/queue-first migration. Roll back consumer/source changes only; preserve runtime stores and original dirty tree.
