# Tier 1 cleanup — status tracker

**Status:** Tier 1 implementation tracker.
**Date:** 2026-05-24
**Scope:** The four "do soon" items from the lead's review, tracked here so the
team knows what's already covered, what's open, and where the work lives.

## Items

### 1. Move runtime state from JSON files to SQLite

**Status:** Done via PRs #192, #195, #196, #197, and #198.

Replace `.pi/agent/state/runtime/{tasks,queue,leases}.json` with a single
SQLite database at `.pi/agent/state/runtime/pi.db`. Tables: `tasks`,
`queue_jobs`, `leases`, `audit_log`. A unique constraint on `leases(scope)`
provides atomic compare-and-swap. JSON schemas remain as documentation.

Landed sequence:
- PR #192: SQLite runtime-state foundation.
- PR #195: `execution-leases` moved to SQLite source of truth.
- PR #196: `tasks-state` moved to SQLite source of truth.
- PR #197: `queue-state` moved to SQLite source of truth.
- PR #198: audit-log dual-write to SQLite `audit_log` plus retained JSONL.

Final runtime-state posture: `tasks.json`, `queue.json`, and `leases.json`
auto-migrate/archive into SQLite; `harness-actions.jsonl` remains for ops
debugging while SQLite provides the queryable audit source.

### 2. Sandbox bash exec or invert the tool surface

**Status:** Done after the typed git tool expansion PR. Direction: invert
high-value harness actions to typed tools while keeping `safe-bash` as a
documented warning layer, not a sandbox.

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
| What typed tools needed to be added? | `run_test`, `git_commit`, `git_branch`, `git_push`, `git_checkout` (file I/O already covered by upstream `read`/`write`/`edit`) |

#### Implementation path

A single big-bang inversion was risky (agents and prompts may rely on
bash in unexpected places), so the migration landed in stages:

1. **Add typed tools incrementally.** `git_commit` and `run_test` landed
   first; `git_branch`, `git_checkout`, and `git_push` complete the planned
   high-value git/test surface.
2. **Teach the runtime surface to prefer typed tools.** Each tool registers
   prompt snippets/guidelines that steer agents away from matching bash
   commands.
3. **Tighten the `safe-bash` interceptor.** Bash invocations that match the
   now-typed surfaces are blocked with typed-tool guidance: `git commit`,
   `git branch`, `git checkout`/`git switch`, `git push`, `npm test`,
   `npm run test:*`, `npm run validate:*`, and `npm run typecheck`.
4. **Keep residual bash explicit.** One-off shell utility calls remain
   possible and are still governed by the regex tripwire, task discipline,
   protected-path checks, and audit logging. This is not a sandbox.

#### Decision

Close item 2 for Tier 1. The remaining security-hardening alternative
(OS-level sandboxing for arbitrary bash) remains a future architecture option,
but it is no longer required for the Tier 1 "invert tool surface" path because
the planned high-frequency harness actions now have typed surfaces and
safe-bash redirects.

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

**Status:** Done via PRs #185, #187, #193, and #194.

The `package.json` `harness:*` scripts shell out to `tsx scripts/harness-*.ts`
on every call (~90 callers across TS/sh/mjs). Each spawn costs seconds and
swallows typed errors. Refactor to a single in-process dispatch module that
re-exports per-script `run()` handlers; CLI scripts become thin facades.

The staged in-process dispatch work is now on `main`. CLI scripts remain as
operator-facing facades while shared dispatch avoids the repeated npm-shell-out
path for the covered harness commands.

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
