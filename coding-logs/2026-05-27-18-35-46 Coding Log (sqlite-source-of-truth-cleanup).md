# Coding Log — SQLite source-of-truth cleanup

## Goal

Close the HIGH-severity tier-1 drift identified by the 2026-05-27 system review
(`coding-logs/2026-05-26-09-26-58 Coding Log (weekly-summary-2026-05-19_to_2026-05-26).md:155-239`):

> Runtime state has a source-of-truth drift between top-level rules, cleanup
> docs, and operator tooling. `AGENTS.md:77-80` still says JSON is the
> persistence layer, while `docs/initiatives/harness-cleanup/tier-1-status.md:14-28`
> says SQLite at `.pi/agent/state/runtime/pi.db` replaced JSON for tasks/queue/leases.
> The DB schema exists in `.pi/agent/extensions/lib/sqlite-state.ts:5-55`, but
> `harness:doctor` still validates `.pi/agent/state/runtime/{leases,queue,tasks}.json`
> in `.pi/agent/extensions/doctor.ts:22-96` and reports pass based on those files.

Two parts:
1. Align AGENTS.md, README.md, `validation_architecture.md`, and the `till-done`
   extension spec so they all say SQLite at `pi.db` is canonical and the
   runtime JSON files are compatibility/export artifacts.
2. Extend `harness:doctor` with three SQLite-aware checks so the doctor probes
   the canonical store, not just legacy compatibility files.

## Approach

Direct TDD implementation (six files, no agents).

### Doctor checks added (3 new, total 7)

- `sqlite-runtime-db` — DB file presence at `.pi/agent/state/runtime/pi.db`,
  required tables present (`tasks`, `active_task`, `queue_jobs`, `queue_meta`,
  `leases`, `audit_log`), `PRAGMA integrity_check` ok, row counts per table
  reported in details.
- `sqlite-consistency` — `active_task.task_id` and `queue_meta.active_job_id`
  reference existing rows when set; each `queue_jobs.payload_json` is a JSON
  object (not array/scalar/malformed); each `linkedTaskId` in a job payload
  references a real task. Malformed payloads surfaced explicitly.
- `sqlite-audit-log` — SQLite `audit_log` table is queryable and reports row
  count (canonical audit source; legacy `logs/harness-actions.jsonl` is kept
  as append-only audit history).

### Probe semantics

Probes use a read-write `DatabaseSync` connection with `PRAGMA query_only = ON`
so SQLite can perform WAL recovery if needed, while the doctor stays effectively
read-only. (Tried `{ readOnly: true }` first — QCHECK correctly flagged that
read-only handles cannot perform WAL recovery, which would falsely fail doctor
on a recoverable DB.)

`openRuntimeDb` runs the schema DDL with `CREATE TABLE IF NOT EXISTS`, which
would silently recreate dropped tables and defeat the diagnostic. The probe
opens a raw `DatabaseSync` instead so missing tables actually surface as a
schema-broken failure.

Every probe function wraps its body in try/catch so a thrown query (e.g.
`SQLITE_ERROR`) becomes a structured `status: "fail"` result instead of
crashing the entire `Promise.all` in `runAllChecks`. This matches the
defensive pattern used in the four pre-existing checks.

## QCHECK findings addressed

Ran `/code-review` via Agent (5 finder angles + sweep, recall mode). Top two
findings were real correctness bugs and were fixed before commit:

1. **Promise.all crash on DB error** (HIGH) — original implementation let
   SQLite exceptions escape, which would have rejected the entire doctor run.
   Wrapped each SQLite check in try/catch to convert errors into structured
   fail-status results. Matches `checkRuntimeState` / `checkAuditLog` pattern.

2. **Read-only handle blocked WAL recovery** (HIGH) — `{ readOnly: true }`
   cannot perform WAL recovery (`SQLITE_READONLY_RECOVERY`). Doctor would have
   reported a recoverable DB as corrupt. Switched to read-write + `PRAGMA
   query_only = ON` instead.

3. **Misleading "integrity_check catches malformed JSON" comment** (HIGH) —
   `PRAGMA integrity_check` validates SQLite page structure, NOT TEXT column
   contents. Dangling `linkedTaskId` references inside malformed payload_json
   would have been silently skipped. Fixed by recording `malformedPayloadJobIds`
   explicitly and surfacing them as a consistency failure.

4. **Doc drift — `till-done.spec.md`** (HIGH) — the till-done extension spec
   still said "persistence layer should be file-backed JSON," directly
   contradicting the AGENTS.md/README/validation_architecture.md cleanup.
   Fixed to point at SQLite.

5. **`-1` sentinel mixed with real row counts** (MEDIUM) — JSON consumers can't
   tell missing-table from "truly -1 rows." Changed to `null` for missing
   tables.

6. **Non-ASCII arrow in log messages** (LOW) — `→` could mojibake on legacy
   terminals. Changed to ASCII `->`.

## Out-of-scope items NOT addressed

- `pi_multi_agent_build_plan_layman_REPO_LOCAL.md:970-972` also says JSON is
  the persistence layer. That file is a historical imported design doc (per
  the `_REPO_LOCAL` naming convention and 23k size), not an authoritative
  current source. Leaving for a future tier-1 doc-archive PR.
- SQL-injection footgun in `countRows` (table name interpolated into SQL) —
  today safe because callers pass hardcoded literals; tracking as a future
  defensive cleanup.
- `withSqliteRuntime<R>` permits an async `fn` signature that would close the
  DB handle before the promise resolves. Latent; no current async callers.

## Files changed

- `.pi/agent/extensions/doctor.ts` — added 3 new exported check functions
  (`checkSqliteRuntimeDb`, `checkSqliteConsistency`, `checkSqliteAuditLog`)
  + supporting helpers (`withSqliteRuntime`, `listSqliteTables`, `countRows`,
  `readIntegrityCheck`, `readActiveTaskId`, `readActiveJobId`,
  `readQueueJobPayloads`, `readTaskIds`); `runAllChecks` now runs all 7
  checks in parallel.
- `scripts/harness-doctor.ts` — updated `printHelp` to list the new checks
  and state that SQLite at `pi.db` is canonical.
- `tests/extension-units/doctor.test.ts` — 12 new tests covering all
  pass/fail paths for the three new checks; existing tests updated for
  `runAllChecks` returning 7 results.
- `AGENTS.md` — "Task architecture note" rewritten so SQLite is canonical
  and JSON files are compat.
- `README.md` — "Roadmap status" runtime-bookkeeping bullet now mentions
  `pi.db` as canonical and clarifies JSON / JSONL roles.
- `.pi/agent/docs/validation_architecture.md` — "Layer 2 primary assets" list
  now includes `pi.db` as canonical store.
- `.pi/agent/extensions/till-done.spec.md` — "Current architectural decision"
  updated to SQLite.

## Evidence

- `npm run typecheck` → clean (baseline 0).
- `node --experimental-sqlite --import tsx --test tests/extension-units/doctor.test.ts`
  → **28/28 tests pass**, 3 consecutive runs (no flakes).
- `npm run harness:doctor` → all 7 checks PASS on this repo.
- `npm run validate:harness-package` → PASS.
- `npm run validate:harness-routing` → PASS.
- `npm run validate:core-workflows` / `validate:extension-units` → pre-existing
  failures unrelated to this PR (confirmed by `git stash && npm run …`
  reproduces the same failures on a clean tree). New code passes.

## Wiring verification

| New export | Non-test import | File:Line |
|---|---|---|
| `checkSqliteRuntimeDb` | YES | `doctor.ts` in `runAllChecks` |
| `checkSqliteConsistency` | YES | `doctor.ts` in `runAllChecks` |
| `checkSqliteAuditLog` | YES | `doctor.ts` in `runAllChecks` |

## Unresolved risks / known gaps

- The "missing DB" fail message tells operators to run `npm run harness:status`
  to lazily initialize the DB. Verified this works in this repo (status opens
  the runtime DB via `openRuntimeDb` and the doctor passes afterwards). If
  another harness command runs first in a particular workflow, the same
  lazy-init applies.
- No tests cover the WAL-recovery code path explicitly because reproducing a
  half-written WAL state deterministically in-process is hard. The fix is
  defensive — `query_only = ON` is a known-good pattern that allows recovery
  while preventing writes.
- `validate:extension-units` does not include `doctor.test.ts` in its check
  list. Adding it is a separate scope (validator-wiring PR).
