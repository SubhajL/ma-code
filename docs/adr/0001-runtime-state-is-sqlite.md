# ADR-0001: Runtime state is SQLite at `.pi/agent/state/runtime/pi.db`, not JSON

- **Status:** Accepted
- **Date:** 2026-05-27
- **Supersedes:** none
- **Superseded-By:** none

## Context

Through 2026-04 and 2026-05 the harness's runtime state — task list,
queue jobs, execution leases, audit history — lived in JSON files under
`.pi/agent/state/runtime/`:

- `tasks.json`
- `queue.json`
- `leases.json`

The JSON layout was easy to inspect with `cat` but provided no atomicity
guarantees across cross-entity writes. Coupled queue/task transitions
were not crash-consistent, lease acquisition had to be reimplemented with
file locks and ad-hoc compare-and-swap, and there was no queryable audit
source — operators grep'd JSONL by hand.

Between PRs #192 and #198 (catalogued in
[`docs/initiatives/harness-cleanup/tier-1-status.md`](../initiatives/harness-cleanup/tier-1-status.md))
the team migrated all four pieces of runtime state to a single SQLite
database. The DB schema lives in `.pi/agent/extensions/lib/sqlite-state.ts`
and is opened lazily by `openRuntimeDb()` whenever any harness command
needs runtime state.

The migration was implemented, but the documentation that drove agent and
operator behavior was not updated in lockstep. As of 2026-05-27, before
this ADR landed:

- `AGENTS.md` "Task architecture note" said *"JSON is the persistence
  layer for task and queue state."*
- `harness:doctor` (`.pi/agent/extensions/doctor.ts`) still validated
  only the legacy JSON files and reported PASS without ever inspecting
  `pi.db`.
- `.pi/agent/extensions/till-done.spec.md` "Current architectural
  decision" said *"persistence layer should be file-backed JSON."*

A 2026-05-27 system review identified this as a HIGH-severity drift:
two authoritative-looking docs disagreed about what the source of truth
was. PR #223 fixed the drift in `AGENTS.md`, the operator README,
`validation_architecture.md`, the `till-done` spec, and `harness:doctor`
(adding three SQLite-aware checks). This ADR records the decision that
that PR (and the underlying tier-1 work) embodies, so the answer is
locked in one authoritative place and future drift can be resolved
against it.

## Decision

The harness's canonical runtime state lives in a single SQLite database
at `.pi/agent/state/runtime/pi.db`. Specifically:

- **Tables:** `tasks`, `active_task` (singleton), `queue_jobs`,
  `queue_meta` (singleton), `leases`, `audit_log`. Schema is defined by
  `RUNTIME_DB_SCHEMA_DDL` in `.pi/agent/extensions/lib/sqlite-state.ts`.
- **Connection semantics (binding):** the runtime store is opened in WAL
  mode with foreign keys enabled. The DB is created on first call to
  the runtime helpers — there is no separate `harness:init` step.
- **Diagnostic access (binding):** `harness:doctor` probes the DB
  without writing to it. The exact handle-mode (read-write with
  `PRAGMA query_only = ON` today, in `.pi/agent/extensions/doctor.ts`)
  is an implementation choice that may evolve; future changes that
  keep the read-only behavior contract do not require a new ADR.

The legacy JSON files (`tasks.json`, `queue.json`, `leases.json`) under
the same directory are **compatibility and export artifacts only**. On
first read after migration they auto-import into SQLite and the original
file is renamed to `<name>.migrated-<timestamp>`. After that point they
have no authority. Agents and operators must not treat them as the source
of truth and must not hand-edit them as the normal path.

The append-only `logs/harness-actions.jsonl` audit log is retained as a
local, append-only operational history file. The **canonical**, queryable
audit source is the SQLite `audit_log` table; the JSONL file is a mirror
for grep convenience and CI log collection. Both should always contain
the same events; if they diverge, the SQLite table is correct.

### What this decision explicitly does NOT cover

- **SQLite as a real domain store.** Today the `tasks` and `queue_jobs`
  tables store opaque `payload_json` blobs plus a duplicated status
  column. Whether to add a migrations table, true row-level operations,
  foreign-key constraints across entities, and JSON-schema validation
  at write-time is a future decision that may supersede the
  payload-blob aspect of this ADR but does not change the "SQLite is
  canonical" answer. The exact write pattern (today delete-and-insert
  per logical write) is an implementation detail and may evolve without
  a new ADR.
- **Cross-entity atomicity.** `withCoordinatedQueueTaskMutation` in
  `queue-runner.ts` still writes task state and queue state in separate
  SQLite transactions. Making coupled queue+task changes one atomic
  transaction is a separate decision and will get its own ADR.
- **Direct SQLite mutation as a workflow.** Bypassing the runtime task
  tools and hand-editing the DB is still a fallback or maintenance
  path, never the normal operating path. The same rule that applied to
  raw JSON edits applies to raw SQLite edits.

## Consequences

Positive:

- Cross-process and crash-time consistency: SQLite provides real
  durability guarantees that file-backed JSON did not. Lease acquisition,
  queue advancement, and task transitions all benefit.
- Single queryable audit source. SQL queries over `audit_log` replace
  ad-hoc JSONL grep.
- Doctor checks now actually probe the canonical store
  (`checkSqliteRuntimeDb`, `checkSqliteConsistency`,
  `checkSqliteAuditLog`).
- Drift cost is bounded. Future docs disagreements about runtime state
  are resolved by pointing at this ADR.

Negative:

- Operators lose casual `cat tasks.json`. A `harness:state export/import`
  command is a likely follow-up if the friction proves real; today the
  doctor's row-count details and the harness:status surface cover most
  inspection needs.
- The DB file is local-only and not in version control. Reports and
  validation runs that previously could inspect git-checked JSON now
  need a live harness install.
- Two state shapes still exist (SQLite + the auto-migrated JSON files).
  The legacy JSON files are intentionally kept so an older operator
  workflow does not break unrecoverably on the first harness command;
  they will be removed in a future cleanup once the migration is
  considered stable.

## Notes

- Migration PRs: #192, #195, #196, #197, #198 (catalogued in
  [`docs/initiatives/harness-cleanup/tier-1-status.md`](../initiatives/harness-cleanup/tier-1-status.md)).
- Drift fix: PR #223 (this ADR was written as the documentation-side
  closure of the system review that flagged the drift).
- Schema source: `.pi/agent/extensions/lib/sqlite-state.ts` (search for
  `RUNTIME_DB_SCHEMA_DDL`).
- Doctor checks: `.pi/agent/extensions/doctor.ts` (`checkSqliteRuntimeDb`,
  `checkSqliteConsistency`, `checkSqliteAuditLog`).
