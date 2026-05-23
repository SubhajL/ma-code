# Tier 1 cleanup — status tracker

**Status:** Tier 1 planning snapshot.
**Date:** 2026-05-24
**Scope:** The four "do soon" items from the lead's review, tracked here so the
team knows what's already covered, what's open, and where the work lives.

## Items

### 1. Move runtime state from JSON files to SQLite

**Status:** Open. High risk. Dedicated PR.

Replace `.pi/agent/state/runtime/{tasks,queue,leases}.json` with a single
SQLite database at `.pi/agent/state/runtime/pi.db`. Tables: `tasks`,
`queue_jobs`, `leases`, `audit_log`. A unique constraint on `leases(scope)`
provides atomic compare-and-swap. JSON schemas remain as documentation.

Affected: `.pi/agent/extensions/execution-leases.ts`,
`queue-runner.ts`, `recovery-runtime.ts`, `task-packets.ts` (~5,200 LOC) and
20+ integration tests. Should land in its own focused PR so the migration
and the test fan-out review together.

### 2. Sandbox bash exec or invert the tool surface

**Status:** Open. Direction decided: invert (typed tools only).

Deprecate the `safe_bash` escape hatch. Agents go through typed tools
(`read_file`, `write_file`, `run_test`, `git_commit`, etc.). The existing
regex guard remains as a warning layer but is already documented as
non-security ([safety rules in AGENTS.md](../../AGENTS.md), PR #178).

Scope check needed before implementation: confirm whether the tool surface
lives in this repo or in upstream `@mariozechner/pi-coding-agent`. If the
latter, this becomes an upstream PR plus a local config change.

### 3. Verify Anthropic prompt caching is on

**Status:** Done via PR #182.

Producer side is complete upstream: `@mariozechner/pi-ai` already applies
`cache_control` to system messages, tool definitions, and the last user
message, and surfaces `cacheRead`/`cacheWrite` in its `Usage` type. See
`.pi/agent/docs/prompt_cache_instrumentation.md` for the audit.

Consumer side: PR #182 landed a tested `summarizeUsage` /
`aggregateCacheTelemetry` utility at `.pi/agent/extensions/cache-telemetry.ts`,
deliberately unwired because pi-coding-agent's session loop does not yet
expose a per-call hook. When the upstream hook lands, the wiring is two
lines.

No further work in this repo until upstream exposes the hook.

### 4. Replace npm-shell-out with in-process dispatch

**Status:** Open. Medium risk. Next PR.

The `package.json` `harness:*` scripts shell out to `tsx scripts/harness-*.ts`
on every call (~90 callers across TS/sh/mjs). Each spawn costs seconds and
swallows typed errors. Refactor to a single in-process dispatch module that
re-exports per-script `run()` handlers; CLI scripts become thin facades.

## How this list maps to the existing audits

- Tier 0 coverage audit ([coverage-audit.md](./coverage-audit.md)) catalogs
  what is currently tested and skipped — useful baseline before any of these
  refactors touch the test surface.
- Tier 0 prompt-cache audit
  ([prompt_cache_instrumentation.md](../../../.pi/agent/docs/prompt_cache_instrumentation.md))
  is the evidence for item 3's "done" status above.

## Caveats

- This is a tracker, not a plan. Each open item gets its own design pass
  before implementation lands.
- "Done" for item 3 means *nothing more can be done locally*, not "the cache
  hit rate is being measured." That measurement is blocked on an upstream
  hook, as documented in the prompt-cache audit.
