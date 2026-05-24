# Pi Harness — Architectural Review

**Status:** Reference snapshot of the lead's review, refreshed against current
repo state. Companion to [coverage-audit.md](./coverage-audit.md) (Tier 0
reachability) and [tier-1-status.md](./tier-1-status.md) (Tier 1 tracker).
**Date:** 2026-05-24

## Bottom line

A principled-but-bloated harness: instincts are right, implementation accreting.
Since the original review, **Tier 0 is mostly landed** (audit, typecheck script,
doctor command, telemetry utility, safety doc) and **two of the four Tier 1
items have moved**: prompt caching is satisfied via upstream + a tested
consumer-side utility, and in-process dispatch has its first foothold (3 of 12
operator subcommands migrated, central dispatch table in place). The big-risk
items (SQLite, sandbox/invert) are still open and remain the highest-leverage
cleanup.

## High-level

### What's good

Unchanged from the original: safety/runtime-enforcement-first stance, bounded
sessions over daemons, evidence as a first-class type, worktree-per-worker
isolation, schemas as a real artifact, append-only audit log.

**Newly added since the original:**

- `harness:doctor` (PR #180) — read-only health-check for runtime state,
  schemas, models config, and audit log.
- Explicit safety-doc clarification (PR #178, AGENTS.md §Safety) acknowledging
  `safe-bash` is a guardrail, not a security boundary. Converts a hidden
  assumption into an explicit rule.
- Central dispatch table (PR #185) — `scripts/lib/harness-dispatch.ts` is now
  the single source of truth for operator subcommands; `status`, `leases`,
  and `queue-session` run in-process.

### What concerns me at the architectural level

1. **Phase-driven growth has produced sprawl.** *Still true.* Counts have
   **drifted up**, not down: 50 extension files (was 48), 34 harness scripts
   (was 33), 45 bash validators (was 40+). Consolidation work hasn't started.

2. **There is no engine, only a fleet of scripts.** *Partially addressed.*
   The operator router (`scripts/harness-operator.ts`) no longer hand-rolls
   `spawn` per subcommand; it dispatches through `runHarnessCommand`. 3 of 12
   operator subcommands skip the spawn entirely. But `orchestrator-run.ts`
   still builds `DelegatedRunCall { executable: "npm" }`, and the 90 npm-shell
   callsites elsewhere are unchanged. Pattern is proven; migration is
   incremental per-script.

3. **State is JSON-on-disk with no atomic guarantees.** *Still true.*
   `acquireExecutionLease` still races; `withFileMutationQueue` is still
   single-process. Tier 1 item 1 (SQLite) deferred to a focused future PR —
   scoped at ~5,200 LOC across 4 extensions + 20+ integration tests, which is
   why it didn't fit the most recent cleanup pass.

4. **`safe-bash.ts` is a security-theater layer.** *Still true in code; now
   documented as such.* AGENTS.md §Safety and PR #178 explicitly tell agents
   not to treat it as a security boundary. Tier 1 item 2 (invert tool surface)
   still open; direction decided (typed tools only, not sandboxing).

5. **No real state machine.** *Still true.* Orchestrator FSM still scattered
   across `orchestrator-{classifier,dry-run,apply-policy,run,continue,
   evidence,context}.ts`. Tier 2.

6. **Provider/model coupling leaks everywhere.** *Still true.* `models.json`
   still lists `claude-opus-4-5` and `claude-sonnet-4-6` — Opus is now at
   **4.7** (Sonnet 4.6 is still current). The frontier-tracking gap has
   widened by one release. Tier 2.

7. **README admits the gap honestly.** Unchanged.

## Mid-level structural issues

### Module-shape issues

All entries from the original still hold:

- **God module:** `.pi/agent/extensions/queue-runner.ts` still 3,358 LOC.
- **Bidirectional split:** `recovery-policy.ts` (748L) + `recovery-runtime.ts`
  (677L) still cross-import.
- **Concept duplication:** `task-packets.ts` (897L) +
  `frontend-packet-generator.ts` (375L) + `backend-packet-generator.ts` (377L).
- **Schema/TS hand-mirror:** `.pi/agent/state/schemas/` JSON + TS types both
  define the same shapes.
- **Validators-as-bash:** 45 `validate-*.sh` files; most shell out to
  `node --test` with minor framing.
- **Phase prefixes in code:** "Phase 7 routing", "Phase 8 merge", etc. still
  appear in module docs and tests.
- **No-op default exports:** `executionLeasesExtension(): void {}` pattern
  still in use across helper-only modules.
- **Over-engineered envelopes:** `tool-result-envelope.ts` still ~346L.

**Nothing has consolidated. Counts have drifted up, not down.** The Tier 0
coverage audit (PR #181) catalogues these clusters; they're Tier 2 work in
the tier-1-status tracker.

### Workflow issues

- **Two layers of test runners** (`test:*` and `validate:*`) — still true.
- **Bash safety blocks raw git** with soft circularity around the helpers —
  still true; safety doc (PR #178) names the circularity but doesn't resolve
  it.
- **No prompt-cache evidence** — **resolved enough to deprioritize.** Producer
  side is in upstream `@mariozechner/pi-ai` (applies `cache_control` to
  system, tool definitions, last user message; surfaces `cacheRead`/
  `cacheWrite` in `Usage`). Consumer side is the tested `summarizeUsage` /
  `aggregateCacheTelemetry` utility (PR #182), deliberately unwired pending a
  per-call hook in `pi-coding-agent`. Documented in
  `.pi/agent/docs/prompt_cache_instrumentation.md`. Nothing more this repo
  can do; waiting on upstream.
- **`harness-actions.jsonl` has no rotation** — still true.
- **`pi-session-*.html` files** — *correction:* never tracked.
  `git ls-files` returns 0; they're gitignored. They sit on disk under
  `.pi/agent/` (not repo root). **Drop this finding** — it was a misread in
  the original review.

## Nitty-gritty findings

All findings stand unchanged. None of the touched files in the recent
cleanup pass were `safe-bash.ts`, `execution-leases.ts`, `queue-runner.ts`,
`orchestrator-run.ts`, `till-done.ts`, or `models.json`. Specifically:

- **safe-bash TOCTOU/bypass** — unchanged code; now documented as expected.
- **execution-leases TOCTOU on acquire** — unchanged; blocks on SQLite
  migration.
- **queue-runner.ts 3,358 LOC god module** — unchanged.
- **orchestrator-run.ts `DelegatedRunCall { executable: "npm" }`** —
  unchanged. Dispatch-table pattern (PR #185) sets up the infrastructure to
  migrate this when ready.
- **till-done.ts 12-verb action union + 13-field `GraphifyEvidenceInput`** —
  unchanged.
- **models.json hardcoded models, two releases behind** — unchanged.

### Tests

- Still on Node's built-in `--test`. Still no TAP/JUnit reporter wired into
  `validate:*`. Still no schema round-trip tests.
- **New since the original:** root `tsconfig.json` + `npm run typecheck`
  (PR #183) expose a **45-error baseline** across 14 files (catalogued in
  [coverage-audit.md §4](./coverage-audit.md#4-typecheck-baseline-running-npm-run-typecheck-from-pr-002)).
  PRs #184 and #185 added 0 net errors.

### Docs and prompts

- `AGENTS.md` / `SYSTEM.md` / `README.md` / `.pi/agent/docs/*.md` overlap is
  unchanged.
- **New since the original:** this directory
  (`docs/initiatives/harness-cleanup/`) is the system-of-record:
  [coverage-audit.md](./coverage-audit.md),
  [tier-1-status.md](./tier-1-status.md), and this file.

## Recommended architectural changes, prioritized — current state

### Tier 0 — invariants and visibility

| Item | Status | Evidence |
|---|---|---|
| `tsc --noEmit` script over all harness TS | **Done** | PR #183 — root `tsconfig.json` + `npm run typecheck`; 45-error baseline known. |
| Wire `tsc --noEmit` into CI | **Done** | `typecheck-baseline` job in `.github/workflows/ci.yml` runs `scripts/check-typecheck-baseline.sh`; fails on regression, passes on burndown with a warning. |
| Retire `check-foundation-extension-compile.sh` | **Open, gated on burndown** | Kept as belt-and-suspenders until the 45-error baseline reaches 0. |
| Treat baseline typecheck errors as production bugs | **Open** | 14-file × 45-error backlog catalogued; ratchet at `.typecheck-baseline-count` prevents drift up while burndown happens incrementally. |
| Coverage / reachability audit | **Done** | PR #181 — [coverage-audit.md](./coverage-audit.md). |
| `harness:doctor` health-check | **Done** | PR #180. |

### Tier 1 — do soon

| # | Item | Status | Where |
|---|---|---|---|
| 1 | SQLite migration | **Open** | Scoped at ~5,200 LOC + 20+ tests; [tier-1-status.md](./tier-1-status.md) flags as dedicated PR. |
| 2 | Sandbox vs invert tool surface | **Open, scope-checked** | Invert (typed tools only). `safe-bash` is local (this repo); `bash` tool is upstream and can only be blocked via interceptor. Plan staged into multi-PR: add typed tools (`git_commit`, `run_test`, etc.) → update prompts → tighten interceptor. See [tier-1-status.md §2](./tier-1-status.md). |
| 3 | Verify Anthropic prompt caching | **Done** | Upstream `pi-ai` already applies `cache_control`; PR #182 landed consumer-side utility + gap doc. |
| 4 | In-process dispatch | **Partial** | PR #185 — central dispatch table + 3 of 12 operator subcommands in-process. 9 still spawn-based behind the same table; each is a one-line follow-up PR (switch entry from `spawned()` to `inProcess()` and add `runFromArgv` to the target). |

### Tier 2 — do this quarter

5. Collapse the orchestrator FSM — **Open.**
6. Consolidate small modules (recovery, packets, stitch) — **Done.** This
   change adds consolidated `recovery.ts`, `packets.ts`, and `stitch.ts`
   extension surfaces, rewires the cluster CLIs/validators/tests through them,
   and keeps the old import paths available for compatibility. The audit
   pre-listed the clusters
   ([coverage-audit.md §5](./coverage-audit.md#5-duplicated-concept-clusters-worth-consolidating-tier-2-input)).
7. Codegen TS types from JSON schemas — **Open.**
8. Provider / capability abstraction — **Open.** Need to bump
   `claude-opus-4-5` → `claude-opus-4-7` regardless.

### Tier 3 — when convenient

9. Drop phase numbering from filenames, modules, doc headings — **Open.**
10. One Node-based validator runner replacing the 45 `validate-*.sh` —
    **Open.**
11. Rotation + retention on `harness-actions.jsonl` — **Open.**
12. ~~Move `pi-session-*.html` out of repo root.~~ *Drop.* Files were never
    tracked.

## Things I might be wrong about

- **Shell-out architecture as a fault-isolation boundary** — the new dispatch
  table is *additive*: the 9 still-spawn-based heavy subcommands keep their
  isolation. The migration path lets each subcommand make its own
  isolation-vs-speed tradeoff explicit, rather than forcing one answer
  harness-wide.
- **Phase numbering as load-bearing identity** — unchanged. Still worth a
  team conversation before renaming.
- **JSON files as git-trackable for reviewability** — *partially mooted by
  reality.* Runtime state (`tasks.json`, `queue.json`, `leases.json`) is
  already gitignored (per safety rules and PR #70 in the historical record).
  SQLite doesn't trade off reviewability against anything for those — they
  were never tracked. The trade-off is: lose `cat tasks.json` for debugging,
  gain atomic CAS + indexes + queryability.
