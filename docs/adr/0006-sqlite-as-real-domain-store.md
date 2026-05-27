# ADR-0006: SQLite is a real domain store — versioned migrations, declared foreign keys, typed row ops

- **Status:** Accepted
- **Date:** 2026-05-28
- **Supersedes:** none
- **Superseded-By:** none

## Context

[ADR-0001](./0001-runtime-state-is-sqlite.md) made SQLite at
`.pi/agent/state/runtime/pi.db` the canonical runtime store. The
migration from JSON files (PRs #192/#195/#196/#197/#198) shipped a
schema defined as a single `RUNTIME_DB_SCHEMA_DDL` block of
`CREATE TABLE IF NOT EXISTS` statements that runs on every
`openRuntimeDb`. That gave us atomic per-table writes and indexed
queries, but it stopped short of treating SQLite as a domain store:

- **No schema versioning.** A change to `RUNTIME_DB_SCHEMA_DDL` only
  takes effect for new databases. Existing pi.db files on
  contributor machines silently keep the old shape because
  `CREATE TABLE IF NOT EXISTS` no-ops on a table that already
  exists. There has been no way to evolve column shape, add
  indexes, or split a payload out of `payload_json` once a database
  was in the wild.
- **No declared foreign keys.** `PRAGMA foreign_keys = ON` has
  been enabled in `openRuntimeDb` since the SQLite cut-over, but
  none of the `tasks`/`queue_jobs`/`active_task`/`queue_meta`
  tables declared FK constraints. Cross-entity references (e.g.,
  `active_task.task_id → tasks(id)`,
  `queue_jobs.linkedTaskId → tasks(id)`) lived inside JSON
  payloads and were validated only by `harness:doctor`'s
  consistency probe (PR #223). The doctor catches dangling
  references after the fact; the store never refused to create
  them.
- **JSON-payload reads/writes everywhere.** Even on the leases
  table, which already has columnar typed row ops
  (`tryAcquireLease`, `releaseLease`, `heartbeatLease`,
  `purgeExpiredLeases` in `sqlite-state.ts`), the
  tasks/queue/active-task surfaces read a whole `payload_json`,
  parse it, mutate, and write it back. There is no idiom for a
  single typed column update.

ADR-0005 landed the typed control-plane kernel and explicitly
expected that "the kernel will reveal where the constraints
actually need to live". The kernel's `ControlPlaneCommandSpec.run`
will be the natural home for write operations that today live in
queue-runner and tasks-state — and those operations need a
foundation to express their constraints (FKs), evolve them
safely (migrations), and read/write the columns they care about
(typed row ops). This ADR establishes that foundation.

## Decision

The runtime SQLite store is a real domain store. Three concrete
mechanisms support that:

### 1. Versioned migrations (`schema_migrations` table + framework)

A new module
[`.pi/agent/extensions/lib/runtime-migrations.ts`](../../.pi/agent/extensions/lib/runtime-migrations.ts)
exports `RUNTIME_MIGRATIONS`, an ordered, append-only list of
`RuntimeMigration { name, up(handle) }` entries. Names follow
`NNN_snake_case`; their lexical order is application order.

`applyRuntimeMigrations(db)` does the following on every
`openRuntimeDb`:

1. `CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT
   PRIMARY KEY, applied_at INTEGER NOT NULL)`.
2. Read-side fast path: `SELECT name FROM schema_migrations`. If
   every migration in `RUNTIME_MIGRATIONS` is already recorded,
   return without taking any write lock. This is the steady-state
   case on every open after the first ever — critical because
   `openRuntimeDb` is also called from inside
   `withAtomicQueueAndTasksMutation` (ADR-0003), where holding
   the write lock would deadlock against the outer transaction.
3. Otherwise: `BEGIN IMMEDIATE`, re-read inside the lock (another
   process may have applied some during the gap), apply the
   missing migrations in order, record each in
   `schema_migrations`, `COMMIT`. Any throw rolls back the
   transaction.

Rules for adding a migration (binding):

- Append to `RUNTIME_MIGRATIONS`, never edit a shipped entry.
- Names are immutable; renaming would re-apply the body against
  databases that already have it.
- Each `up` must be safe to run inside the framework's `BEGIN
  IMMEDIATE` — no nested transactions, no `openRuntimeDb` from
  inside the body.
- `up` should be idempotent at the DDL level where possible
  (`CREATE TABLE IF NOT EXISTS`, `PRAGMA table_info` guards
  before `ALTER TABLE ADD COLUMN`) so a half-applied migration
  can be re-run after a crash.

### 2. Declared foreign keys

This PR ships two migrations that declare the existing logical
FKs as real SQLite constraints:

- **`001_add_queue_jobs_linked_task_id`** — adds a
  `linked_task_id TEXT DEFAULT NULL REFERENCES tasks(id) ON
  DELETE SET NULL` column to `queue_jobs`. New writes
  populate the column; SQLite enforces the reference at insert
  /update time and clears it to NULL when the parent task is
  deleted. Existing rows keep their `linkedTaskId` inside
  `payload_json` for backward compatibility; column-level
  enforcement applies forward.
- **`002_add_active_task_fk`** — recreates the `active_task`
  singleton with `task_id TEXT REFERENCES tasks(id) ON DELETE
  SET NULL`. SQLite cannot ALTER an existing column to add a
  REFERENCES clause, so the migration follows the supported
  copy-and-rename recipe: create `active_task_new` with the FK,
  copy the (at most one) row while dropping stale references to
  NULL, drop the old table, rename. Cascade semantics ensure a
  task delete cannot leave a dangling active pointer.

`harness:doctor`'s `sqlite-consistency` check stays in place as
defense-in-depth for data that predates these migrations or for
operators who deliberately bypass FK enforcement.

### 3. Typed row ops

A new module
[`.pi/agent/extensions/lib/runtime-typed-ops.ts`](../../.pi/agent/extensions/lib/runtime-typed-ops.ts)
exports the first columnar read/write pair:

- `getActiveTaskId(db): string | null`
- `setActiveTaskId(db, taskId | null): void`

These read/write the `active_task.task_id` column directly
instead of going through the JSON-payload `applyTasksStateToDb`
path. Callers that only need the active pointer no longer pay to
deserialise the full tasks-state payload, and `setActiveTaskId`
benefits from the FK declared in migration 002 — passing an
unknown task id throws `FOREIGN KEY constraint failed` instead
of silently writing a dangling reference.

Future typed row ops belong in this module (or, if they grow
substantial for one entity, a sibling file like
`runtime-typed-ops-tasks.ts`). New code SHOULD prefer them over
the JSON-payload helpers; existing JSON-payload code paths stay
as-is and may migrate opportunistically.

### What this decision explicitly does NOT cover

- **Migrating every existing JSON-payload helper to typed row
  ops.** This PR ships one pair (active-task get/set) as proof of
  life. Migrating `mutateTasksState`, `mutateQueueState`,
  `appendAuditEntry`, and the dozens of call sites is opportunistic
  follow-up. Each migration is a focused PR.
- **Adding FKs everywhere they make logical sense.** This PR
  ships two FKs (queue_jobs.linked_task_id, active_task.task_id).
  A third logical FK — `queue_meta.active_job_id → queue_jobs(id)`
  — is symmetric to active_task but deferred to keep scope tight.
  When added, follow the migration 002 copy-and-rename pattern.
- **Down migrations.** Migrations are forward-only. SQLite cannot
  reliably reverse most DDL, and the harness's bounded-autonomy
  model (ADR-0002) means recovery is operator-driven (restore
  from the JSONL audit log or a backup), not migration-driven.
- **Cross-extension schema** (e.g., tables defined by extensions
  outside `.pi/agent/extensions/lib/`). Today only the lib-owned
  schema goes through this framework; if extensions ever own
  tables, they will need a parallel mechanism. Not in scope.
- **A migration CLI** (`harness:migrate up`/`status`/etc.).
  Migrations run automatically on every `openRuntimeDb` open,
  which is sufficient because every harness command opens the DB
  through that helper. A CLI would be useful for ops debugging
  but adds an operator-facing surface we don't yet need.

## Consequences

Positive:

- Schema evolution is now safe. Future PRs can `ALTER TABLE` or
  split JSON payloads into columns without worrying about
  contributor pi.db files silently keeping the old shape.
- Two cross-entity inconsistencies that the doctor used to catch
  after the fact (`active_task.task_id` and
  `queue_jobs.linkedTaskId`) are now refused at write time.
  Dangling pointers cannot enter the store via the public API.
- New code has a clear pattern for typed columnar reads/writes —
  the `getActiveTaskId`/`setActiveTaskId` pair shows the shape
  without imposing it on existing code.
- ADR-0007 (the future validator-report schema, step 7 of the
  prioritization roadmap) can build on this foundation: typed
  rows for validator state, FKs for `validator_report → task`,
  versioned migrations as the report schema evolves.

Negative:

- Every `openRuntimeDb` now reads the `schema_migrations` table.
  The read-side fast path keeps the steady-state cost to one
  prepared `SELECT name FROM schema_migrations` plus a set
  membership check — measured at well under a millisecond on a
  warm SQLite cache — but it is non-zero on every open and on
  every nested open inside coordinated transactions.
- Tests that previously seeded a dangling `active_task.task_id`
  or `queue_jobs.linked_task_id` to exercise doctor's consistency
  check must now toggle `PRAGMA foreign_keys = OFF` for the setup
  insert. One such test (in `doctor.test.ts`) was updated in this
  PR; future tests that want to assert dangling-reference
  detection must follow the same pattern.
- `RUNTIME_MIGRATIONS` is append-only, and the
  rule against editing shipped entries is advisory, not
  programmatically enforced. A contributor who edits an existing
  migration's body would silently desync between machines that
  have already applied it and machines that have not. A
  static-check assertion that verifies the migration list against
  a hash file is possible follow-up work but not in this PR.

## Notes

- Migration framework:
  [`.pi/agent/extensions/lib/runtime-migrations.ts`](../../.pi/agent/extensions/lib/runtime-migrations.ts).
- Typed row ops:
  [`.pi/agent/extensions/lib/runtime-typed-ops.ts`](../../.pi/agent/extensions/lib/runtime-typed-ops.ts).
- Wiring:
  [`.pi/agent/extensions/lib/sqlite-state.ts`](../../.pi/agent/extensions/lib/sqlite-state.ts)
  calls `applyRuntimeMigrations` inside `openRuntimeDb` after the
  DDL block and before returning the handle.
- Tests:
  `tests/extension-units/runtime-migrations.test.ts` (10 tests
  covering fresh-apply, idempotence, schema_migrations bookkeeping,
  FK enforcement on `queue_jobs.linked_task_id` and
  `active_task.task_id`, ON DELETE SET NULL cascade, typed row
  op roundtrip, name-format invariants, and the
  `options.migrations` override path).
- Test adjustment: `tests/extension-units/doctor.test.ts` toggles
  `PRAGMA foreign_keys = OFF` around the setup insert in the
  "dangling activeTaskId" case so it can still assert the
  defense-in-depth doctor check fires.
- Known follow-up: `scripts/validate-extension-unit-tests.sh` has
  a hardcoded check list and does not auto-discover the new
  `runtime-migrations.test.ts`. Same gap noted for
  `doctor.test.ts`, `harness-package.test.ts`,
  `coordinated-state.test.ts`, and `control-plane.test.ts` in
  their respective coding logs. Validator-wiring is a separate PR.
- Related: [ADR-0001](./0001-runtime-state-is-sqlite.md) (the
  SQLite cut-over this builds on),
  [ADR-0003](./0003-atomic-queue-task-mutations.md) (the
  coordinated-mutation lock this nested-open path must not
  deadlock against),
  [ADR-0005](./0005-typed-control-plane-kernel.md) (the kernel
  whose `run` bodies will be the primary consumers of typed row
  ops).
