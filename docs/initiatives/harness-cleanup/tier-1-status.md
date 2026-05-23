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

**Status:** Open. Direction decided: invert (typed tools only). **Scope
check complete (2026-05-24): doable in this repo, medium-sized work.**

Deprecate the `safe_bash` escape hatch. Agents go through typed tools
(`read_file`, `write_file`, `run_test`, `git_commit`, etc.). The existing
regex guard remains as a warning layer but is already documented as
non-security ([safety rules in AGENTS.md](../../AGENTS.md), PR #178).

#### Scope check findings

| Question | Answer |
|---|---|
| Where is `safe-bash` implemented? | This repo: `.pi/agent/extensions/safe-bash.ts` (799 LOC) |
| What does it do? | Uses `pi.on("tool_call", ...)` — it is an **interceptor**, not a tool definition |
| Where is the `bash` tool defined? | Upstream: `@mariozechner/pi-coding-agent/dist/core/tools/bash.js`. Can't remove or replace; can only block at the interceptor |
| Built-in tools available today | `bash`, `edit`, `edit-diff`, `find`, `grep`, `ls`, `read`, `write` |
| Custom tool registration possible? | Yes — 10+ harness extensions already register tools via `pi.registerTool(...)` |
| What typed tools would need to be added? | `run_test`, `git_commit`, `git_branch`, `git_push`, `git_checkout` (file I/O already covered by upstream `read`/`write`/`edit`) |

#### Recommended implementation path

A single big-bang inversion is risky (agents and prompts may rely on
bash in unexpected places). Stage the migration:

1. **Add typed tools incrementally.** Start with the highest-value ones
   the harness needs most often: `git_commit`, `git_branch`,
   `git_checkout`, `run_test`. Each is a new file in
   `.pi/agent/extensions/` that registers via `pi.registerTool` and
   wraps the existing `safe_bash`-mediated command. Tests in
   `tests/extension-units/`.
2. **Update prompts/skills** to prefer the typed tools over bash for
   the matching operations.
3. **Tighten the `safe-bash` interceptor** to block bash invocations
   that match the now-typed surfaces (e.g. block `git commit` via bash
   once `git_commit` is the documented path). This is the actual
   "invert" step — bash becomes the exception, typed tools the norm.
4. **Audit the residual bash use** that can't be typed (one-off shell
   utility calls). Either type them or leave them as the documented
   escape hatch.

Estimated 1-2 focused sessions. Each typed tool is ~50-100 LOC
including tests; the interceptor tightening is per-pattern review
work.

#### Decision

Keep item 2 **open** as multi-PR work, not a single big-bang. First
follow-up PR can be a narrow scope: add one or two typed tools
(probably `git_commit` and `run_test` as the most-used) plus the
prompt updates that teach agents to prefer them. The remaining work
stages incrementally without forcing a single risky cutover.

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
