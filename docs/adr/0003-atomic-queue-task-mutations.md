# ADR-0003: Coupled queue + tasks mutations go through one SQLite transaction

- **Status:** Accepted
- **Date:** 2026-05-27
- **Supersedes:** none
- **Superseded-By:** none

## Context

[ADR-0001](./0001-runtime-state-is-sqlite.md) made SQLite at
`.pi/agent/state/runtime/pi.db` the canonical runtime store for tasks,
queue jobs, leases, and audit rows. That move gave each individual entity
a real ACID write boundary (each write goes through its own
`BEGIN IMMEDIATE ... COMMIT` in `mutateTasksState` and `mutateQueueState`).

But many of the harness's most important operations touch BOTH the tasks
and the queue store as a single logical change: an AFK queue advance
transitions a job to `running` AND links/creates a task; quality-handoff
completion marks a task `done` AND surfaces the next queued job; recovery
finalization clears `activeJobId` AND archives the linked task. The
pre-existing `withCoordinatedQueueTaskMutation` helper in
`.pi/agent/extensions/queue-runner.ts` made these coupled mutations
look atomic from the caller's perspective:

```ts
return withFileMutationQueue(coordinationLock, async () => {
  const [queueState, taskState] = await Promise.all([readQueueState(cwd), readTaskState(cwd)]);
  const state = { queueState, taskState };
  const result = await fn(state);
  await writeTaskState(cwd, state.taskState);
  await writeQueueState(cwd, state.queueState);
  return result;
});
```

The file lock around the whole block serialized concurrent callers, but
the two writes opened **separate** SQLite transactions:
`writeTaskState` ran `BEGIN IMMEDIATE ... COMMIT`, returned, then
`writeQueueState` ran another `BEGIN IMMEDIATE ... COMMIT`. A crash, an
OS-level kill, or a thrown error between the task write and the queue
write would leave the canonical store in a half-applied state: the task
list reflects the mutation, the queue does not (or vice versa).

The 2026-05-27 system review flagged this as a HIGH-severity finding:

> Cross-entity queue/task transitions are not always one SQLite
> transaction. `withCoordinatedQueueTaskMutation` reads queue and task
> state, invokes an async callback, then writes task and queue
> separately. Each lower-level write opens its own DB/transaction.
> Impact: a failure between task write and queue write can leave linked
> task/job state inconsistent. The file lock serializes writers but
> does not make the two logical state changes atomic.

This ADR records the fix shipped in the same PR.

## Decision

Any harness code that mutates **both** the tasks store and the queue
store as one logical change MUST go through
`withAtomicQueueAndTasksMutation` (defined in
`.pi/agent/extensions/lib/coordinated-state.ts`). That helper:

1. Opens **one** `RuntimeDb` connection.
2. Runs the JSON-import backfills (`backfillTasksFromJsonIfPresent`,
   `backfillQueueFromJsonIfPresent`) **outside** the coordinated
   transaction; each opens its own short `BEGIN..COMMIT` because SQLite
   does not support nested transactions on a single connection.
3. Issues one `BEGIN IMMEDIATE`.
4. Reads both stores from the open connection via
   `readTasksStateFromDb` / `readQueueStateFromDb`.
5. Calls the caller-supplied async callback with a
   `{ tasksState, queueState }` snapshot.
6. On successful resolution: applies BOTH snapshots via
   `applyTasksStateToDb` / `applyQueueStateToDb`, then `COMMIT`s.
7. On any throw inside the callback: `ROLLBACK`s so neither store
   advances.
8. Closes the connection in `finally`.

### Re-entry rules (binding)

To prevent silent deadlocks from a second connection trying to
`BEGIN IMMEDIATE` while the coordinated transaction holds the write
lock, the helper sets a process-wide re-entry flag (in
`.pi/agent/extensions/lib/transaction-coordination.ts`). While that flag
is set:

- `withAtomicQueueAndTasksMutation` itself refuses to nest. Mutate the
  outer snapshot and let the outer scope commit.
- `mutateTasksState`, `writeTasksState`, `mutateQueueState`, and
  `writeQueueState` refuse to run with a clear, actionable error
  message naming the caller.
- The internal `backfillFromJsonIfPresent` in `tasks-state.ts` and
  `queue-state.ts` early-returns. The coordinated helper itself runs
  the backfills once at the start of its scope (before the flag is
  set), so nested reads via `readTasksState` / `readQueueState` do not
  need to redo them and must not try (a backfill from inside the scope
  would issue `BEGIN IMMEDIATE` on a second connection and race the
  outer write lock).

Reads that do not go through `withRuntimeDb` (specifically
`readTasksStateFromDb` and `readQueueStateFromDb`, which take an
already-open handle) are safe inside the coordinated callback. Public
`readTasksState` and `readQueueState` are safe because of the backfill
guard described above.

### Cross-process coordination

Within one process, the coordinated helper sets a module-level flag
plus the queue-runner wraps it in an in-process `withFileMutationQueue`
serializer, so concurrent in-process callers either nest-and-error or
queue up.

Across processes, coordination is provided by the SQLite write lock:
each call issues `BEGIN IMMEDIATE`, and `openRuntimeDb` sets
`PRAGMA busy_timeout = 5000` so a contending process waits up to 5
seconds rather than failing immediately with `SQLITE_BUSY`. There is
deliberately no cross-process filesystem lock — that role belongs to
the SQLite database itself.

### Existing migration

`withCoordinatedQueueTaskMutation` in `.pi/agent/extensions/queue-runner.ts`
(the highest-value coupled call site, used by AFK queue advance, quality
finalization, recovery, and others) is migrated in this PR. The file
lock around it is retained — it still serializes concurrent coordinated
callers, which the SQLite transaction does not on its own — but the
inner body now delegates to `withAtomicQueueAndTasksMutation` so the
two writes are one transaction.

### What this decision explicitly does NOT cover

- **Other coupled-state code paths.** This PR migrates exactly one call
  site. Other locations that touch both stores incrementally (e.g.,
  ad-hoc combinations of `mutateTaskState` followed by
  `mutateQueueState`) are not in scope. Migrating them is good follow-up
  work but does not require a new ADR; they should adopt this helper.
- **SQLite as a real domain store.** The same caveats from ADR-0001
  apply. Today the stores are still JSON-payload tables; row-level
  updates, foreign keys across entities, and a migrations table are
  future decisions that may layer on top of this ADR without superseding
  it.
- **Cross-database atomicity** (e.g., touching `audit_log` and a
  cross-cutting external system in the same transaction). Audit-log
  writes happen on the same SQLite DB and can be folded into the
  coordinated transaction in a follow-up; cross-system atomicity is
  out of scope and would need its own decision.

## Consequences

Positive:

- Real cross-entity crash-consistency: a crash or thrown error between
  what used to be two separate writes now either commits both or rolls
  back both.
- The existing `withCoordinatedQueueTaskMutation` signature is
  preserved, so the dozens of call sites that go through it inherit the
  atomicity improvement for free.
- The re-entry guard catches a class of bugs (silent deadlocks from
  nested `mutateTasksState`/`mutateQueueState`) that would otherwise be
  very hard to diagnose in production.

Negative:

- Callers can no longer reuse arbitrary single-entity helpers freely
  inside the coordinated callback. The forbidden patterns surface as
  clear errors, but contributors must learn the rule.
- The coordinated helper holds one SQLite write lock for the duration
  of the callback. Long-running callbacks (e.g., ones doing I/O
  unrelated to state) extend that lock window. Callers should keep the
  callback bodies pure mutations of the snapshot and do any external
  I/O before or after the coordinated scope. (This was already true in
  spirit with the previous file-lock implementation.)
- Two new public exports from `tasks-state.ts` / `queue-state.ts`
  (`readTasksStateFromDb`, `applyTasksStateToDb`,
  `backfillTasksFromJsonIfPresent`, and their queue counterparts) widen
  the API surface that callers might misuse. They are documented as
  "for `withAtomicQueueAndTasksMutation`" in their JSDoc, but the
  language is advisory, not enforced.

## Notes

- Helper: `.pi/agent/extensions/lib/coordinated-state.ts`.
- Re-entry guard: `.pi/agent/extensions/lib/transaction-coordination.ts`.
- Migrated call site:
  `withCoordinatedQueueTaskMutation` in
  `.pi/agent/extensions/queue-runner.ts`.
- Tests:
  `tests/extension-units/coordinated-state.test.ts` (rollback,
  atomic-success, nested-call rejection, scope release).
- Background: the 2026-05-27 system review entry under "Key Risks /
  Gaps → HIGH" in
  `coding-logs/2026-05-26-09-26-58 Coding Log (weekly-summary-2026-05-19_to_2026-05-26).md`.
