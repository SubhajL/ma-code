# Coding Log — Atomic queue/task transaction helper

## Goal

Close the HIGH-severity cross-entity-consistency finding from the
2026-05-27 system review (recorded in
`docs/initiatives/harness-cleanup/` and the weekly-summary coding log):

> `withCoordinatedQueueTaskMutation` reads queue and task state,
> invokes an async callback, then writes task and queue separately in
> `.pi/agent/extensions/queue-runner.ts:734-748`. Each lower-level
> write opens its own DB/transaction. Impact: a failure between task
> write and queue write can leave linked task/job state inconsistent.

This PR introduces a single-transaction helper, migrates the most
load-bearing call site (the queue-runner's `withCoordinatedQueueTaskMutation`)
to use it, and locks the decision in as ADR-0003.

## Approach

Direct TDD implementation, six files of source + one new test file.

### New helper

- `.pi/agent/extensions/lib/transaction-coordination.ts` — module-level
  re-entry flag plus three guard functions (`beginCoordinatedScope`,
  `endCoordinatedScope`, `assertNotInsideCoordinatedScope`,
  `isInsideCoordinatedScope`). Leaf module, no imports.
- `.pi/agent/extensions/lib/coordinated-state.ts` — the public
  `withAtomicQueueAndTasksMutation` helper. Opens ONE RuntimeDb,
  runs the JSON backfills OUTSIDE the coordinated transaction (and
  BEFORE setting the scope flag so the read-side backfill skip does
  not suppress legitimate first-run imports), issues ONE
  `BEGIN IMMEDIATE`, snapshots both stores, calls the caller's
  callback, applies both snapshots, and commits — or rolls back BOTH
  on any throw.

### Existing files modified

- `.pi/agent/extensions/lib/tasks-state.ts` — exports three new
  primitives for the coordinated helper (`readTasksStateFromDb`,
  `applyTasksStateToDb`, `backfillTasksFromJsonIfPresent`). Public
  `mutateTasksState` and `writeTasksState` now refuse to run with a
  clear error when called from inside a coordinated scope. The
  internal `backfillFromJsonIfPresent` early-returns if called inside
  the scope (the coordinated helper has already done the import; a
  nested backfill would race the outer write lock).
- `.pi/agent/extensions/lib/queue-state.ts` — symmetric changes
  (`readQueueStateFromDb`, `applyQueueStateToDb`,
  `backfillQueueFromJsonIfPresent`, guards on `mutateQueueState` /
  `writeQueueState`, backfill skip inside scope).
- `.pi/agent/extensions/lib/sqlite-state.ts` — adds
  `PRAGMA busy_timeout = 5000` on `openRuntimeDb`. Without it,
  concurrent `BEGIN IMMEDIATE` calls (e.g., from a contending process)
  throw `SQLITE_BUSY` immediately; with the timeout they wait up to
  five seconds. This was an existing gap surfaced by QCHECK, not a new
  regression, but the new atomicity story relies on it being correct.
- `.pi/agent/extensions/queue-runner.ts` — `withCoordinatedQueueTaskMutation`
  preserves its existing signature and the in-process file-lock
  serializer, but its body now delegates to
  `withAtomicQueueAndTasksMutation`. All 46 queue-runner unit tests
  pass unchanged.

### ADR-0003

`docs/adr/0003-atomic-queue-task-mutations.md` — records the decision
that coupled queue+tasks mutations MUST go through the new helper,
the re-entry rules, the read-path safety contract, and the
cross-process coordination story (SQLite write lock plus
`busy_timeout`, not a filesystem lock). Adds the index entry in
`docs/adr/README.md`. `scripts/check-repo-static.sh` picks up the new
ADR via the file-vs-index symmetry check landed in PR #224 — no
script changes needed beyond the new `required_files` entry.

## QCHECK findings addressed

Ran `/code-review` (medium effort) on the working tree. The reviewer
returned 9 findings; all real correctness bugs and the high-value
robustness improvements were fixed before commit:

1. **HIGH — Re-entry flag leak on `openRuntimeDb` throw** —
   `beginCoordinatedScope()` was running BEFORE the try block. A
   transient DB-open failure would have left the process-wide
   re-entry flag set permanently, bricking every subsequent queue/task
   write. Fixed by opening the DB FIRST, running backfills, THEN
   setting the scope flag inside a try that has its own finally
   block. A new test exercises the scope-release path.

2. **HIGH — Re-entry flag leak on `closeRuntimeDb` throw** — the
   original finally called `closeRuntimeDb(db)` before
   `endCoordinatedScope()`. A close-time exception would have skipped
   the scope release. Fixed by ordering: inner finally runs
   `endCoordinatedScope()` unconditionally; outer finally wraps
   `closeRuntimeDb` in its own try/catch so a close failure cannot
   mask the original error.

3. **HIGH — Read path inside coordinated callback raced the outer
   transaction.** ADR initially claimed reads were always safe, but
   `readTasksState` / `readQueueState` go through `withRuntimeDb`
   which calls `backfillFromJsonIfPresent`. Backfill opens its own
   `BEGIN IMMEDIATE` on a fresh connection — racing the outer
   coordinated transaction's write lock. Fixed by adding
   `isInsideCoordinatedScope()` early-return inside the internal
   backfill function in both state files. The coordinated helper
   itself runs backfills BEFORE setting the scope flag, so legitimate
   first-run imports still happen.

4. **MEDIUM — No `PRAGMA busy_timeout`** — concurrent
   `BEGIN IMMEDIATE` across connections (multi-process or
   backfill-vs-coordinated) threw `SQLITE_BUSY` immediately rather
   than waiting. Added `PRAGMA busy_timeout = 5000` in
   `openRuntimeDb`.

5. **MEDIUM — File-lock comment was misleading about cross-process
   serialization** — `withFileMutationQueue` is in-process only.
   Updated the comment in `queue-runner.ts` and the corresponding
   "Cross-process coordination" section in ADR-0003 to be honest:
   in-process serialization via the file-mutation queue,
   cross-process via SQLite's write lock + `busy_timeout`.

6. **MEDIUM — `isInsideCoordinatedScope` was a dead export** — now
   wired into the backfill skip in both state files (#3 fix).

7. **LOW — Nested-call assertion regex was too permissive** —
   `/coordinated|nested|atomic|inside/i` would have matched many
   unrelated errors. Replaced with predicate matchers that require
   the specific caller name AND
   "withAtomicQueueAndTasksMutation" / "cannot be nested" strings.

8. **LOW — Only one of four guard sites was tested** — parameterized
   the nested-call test over all four single-entity write entries
   (`mutateTasksState`, `writeTasksState`, `mutateQueueState`,
   `writeQueueState`).

9. **LOW — No generic-return test** — added a test that returns a
   sentinel object from the callback (sync and async forms) and
   asserts the helper propagates it.

## Out-of-scope items NOT addressed

- **Migrating other coupled call sites.** This PR migrates exactly one
  call site (the queue-runner's `withCoordinatedQueueTaskMutation`).
  ADR-0003 establishes the helper as the only sanctioned path for
  new coupled mutations; existing sites that combine
  `mutateTaskState` with `mutateQueueState` ad-hoc can be migrated
  incrementally in follow-up PRs.
- **Real domain-store features** (migrations table, row-level UPDATE,
  FK constraints across entities, JSON-schema validation at write
  time) — explicitly deferred in ADR-0001 and again in ADR-0003.
- **Audit-log writes inside the coordinated transaction.** A natural
  follow-up: fold `appendAuditEntry` into the same `BEGIN..COMMIT`
  when the audit row is causally linked to the queue/task mutation.
  Not in this PR.

## Files changed

- `.pi/agent/extensions/lib/transaction-coordination.ts` — NEW
- `.pi/agent/extensions/lib/coordinated-state.ts` — NEW
- `.pi/agent/extensions/lib/tasks-state.ts` — exports + guards + backfill skip
- `.pi/agent/extensions/lib/queue-state.ts` — symmetric
- `.pi/agent/extensions/lib/sqlite-state.ts` — `PRAGMA busy_timeout`
- `.pi/agent/extensions/queue-runner.ts` — `withCoordinatedQueueTaskMutation`
  delegates to the new helper; comment corrected re in-process lock scope
- `tests/extension-units/coordinated-state.test.ts` — NEW (12 tests)
- `docs/adr/0003-atomic-queue-task-mutations.md` — NEW
- `docs/adr/README.md` — index updated
- `scripts/check-repo-static.sh` — added ADR-0003 to `required_files`

## Evidence

- `npm run typecheck` → clean (baseline 0).
- 87 tests pass 3 consecutive runs across
  `coordinated-state.test.ts` (12) +
  `queue-runner.test.ts` (46) + `doctor.test.ts` (29). No flakes.
- `bash scripts/check-repo-static.sh` → `repo-static-checks-ok`.
- `npm run harness:doctor` → all 7 checks PASS, including
  `sqlite-runtime-db` and `sqlite-consistency` against the live repo.
- Manual: confirmed the QCHECK rollback test failure on the original
  buggy implementation by reverting the fix #1 ordering temporarily;
  reverting back made the test green again.

## Wiring verification

| New export | Non-test import | File:Line |
|---|---|---|
| `withAtomicQueueAndTasksMutation` | YES | `queue-runner.ts:16, 749` |
| `readTasksStateFromDb` | YES | `coordinated-state.ts:9` |
| `applyTasksStateToDb` | YES | `coordinated-state.ts:7` |
| `backfillTasksFromJsonIfPresent` | YES | `coordinated-state.ts:8` |
| `readQueueStateFromDb` | YES | `coordinated-state.ts:15` |
| `applyQueueStateToDb` | YES | `coordinated-state.ts:13` |
| `backfillQueueFromJsonIfPresent` | YES | `coordinated-state.ts:14` |
| `beginCoordinatedScope` | YES | `coordinated-state.ts:18` |
| `endCoordinatedScope` | YES | `coordinated-state.ts:19` |
| `assertNotInsideCoordinatedScope` | YES | `tasks-state.ts:5`, `queue-state.ts:5` |
| `isInsideCoordinatedScope` | YES | `tasks-state.ts:5`, `queue-state.ts:5` (backfill skip) |

## Unresolved risks / known gaps

- The atomicity contract holds for SQLite transactions, but the
  process is still vulnerable to filesystem-level corruption (e.g.,
  power loss with no fsync). SQLite's WAL mode + the default
  durability settings give the same guarantees the pre-PR code did,
  no better; a follow-up that ties `synchronous = NORMAL/FULL` policy
  to harness criticality would be a separate decision.
- `busy_timeout = 5000` is a heuristic. Long-running coordinated
  callbacks that hold the write lock for more than five seconds will
  start to surface `SQLITE_BUSY` to contending callers. ADR-0003
  already advises keeping callback bodies pure mutations; if real
  workloads need longer, raise the timeout or split the mutation.
- `validate:extension-units` does not yet include
  `coordinated-state.test.ts` in its bash-driven check list (same gap
  as `doctor.test.ts` and `harness-package.test.ts` from earlier
  PRs). Adding it is a separate validator-wiring PR.
