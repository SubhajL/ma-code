# Coding Log — Day 1 hardening (2026-10-11)

Source: "Suggested order → Day 1" of the 2026-10-10 independent harness review.
Plan (DREP): `reports/planning/2026-10-11_day1-hardening-plan.md`.
Base: `main` @ `0de9c1f` (includes #253–#257). Implementer: Claude (Opus 5.5) for every slice.

## Answer to the operator's question

Before this work the repo had **no lockfile** (no `package-lock.json`, `.npmrc`, `.nvmrc`) and **no git hooks**:
local `.git/config` pinned `core.hooksPath` to `.git/hooks`, which only holds `*.sample` files, so even the
operator's global `~/.git-hooks` was bypassed here. S5 adds both.

## Slices

| Slice | Branch | Scope |
|---|---|---|
| S1 | `chore/day1-s1-ignore-runtime-db` | ignore `**/.pi/agent/state/runtime/pi.db*`; static check rejects tracked `pi.db*`; plan + this log |
| S2 | `fix/day1-s2-append-system-prompt` | `.pi/SYSTEM.md` → `.pi/APPEND_SYSTEM.md` |
| S3 | `fix/day1-s3-disable-default-auto-land` | shipped auto-land policy `enabled: false` (ADR-0002) |
| S4 | `test/day1-s4-integration-green` | fix the 21 failing integration tests (test-side only) |
| S5 | `chore/day1-s5-check-hook-lockfile` | `npm run check`, tracked pre-push hook, `package-lock.json` |
| S6 | `feat/day1-s6-frontend-opus-routing` | carry the June 9 frontend-Opus routing WIP onto `main` |

## Stop line (g2-coding Q0–Q3)

No delegation for any slice. Q0 fires for S3 (merge-approval boundary) and S5 (protected `.git/config`
change). S1/S2/S4/S6 are a few lines of config, tests or docs each; serializing a brief costs more than
the work, and S4 needs per-test root-cause judgement. Every slice followed test → RED → fix → GREEN.

## Concurrency constraint

Uncommitted H3b work lives in `../ma-code-h3b*` and owns `lib/{coordinated-state,runtime-migrations,tasks-state}.ts`,
`pr-lifecycle.ts`, `queue-runner.ts`, `slice-lifecycle.ts`, `till-done.ts`, `worker-execution.ts`, `tasks.schema.json`,
`docs/adr/README.md` (+ ADR-0011), `logs/CURRENT.md`, five extension-unit tests, `tests/integration/core-workflows.test.ts`
and two validators. No Day 1 slice touches any of them, and no new ADR is written (0011 is taken).

## Plan review (g2-planning Phase 3)

Codex `gpt-5.6-sol` (xhigh) attacked the DREP: 21 findings, all dispositioned in the plan's §11
(`reports/planning/2026-10-11_day1-hardening-plan.md`).

## QCHECK round 1 — combined review of all six slices (framings run in parallel)

One combined round was run instead of six, because the slices are small and interact (shared static check, `npm run check`
composition, models.json). Reviewers: Tier 1 `/code-review high` (Claude workflow), Tier 2 Codex `gpt-5.6-sol` xhigh.
Tier 2 was mandatory (config + merge-approval boundary). Gate before review: `npm run check` green on the combined tree.

| # | Tier | Sev | Finding | Disposition |
|---|---|---|---|---|
| 1 | T1 | HIGH | Pre-push hook ran the suite with git's repo-local env; in a linked worktree `GIT_DIR` is absolute, so fixtures running `git -C <tmp>` hit the real repo | **Fixed:** `unset $(git rev-parse --local-env-vars)`. Proven in scratch: fixed hook → base repo refs/HEAD/commits unchanged; with the line removed the suite moved the real branch, created `task/fixture-worker` and 15 commits (93 failures). |
| 2 | T2 | HIGH | `generate_task_packet` registered twice (packets.ts facade + task-packets.ts autoload); main's test only covered recovery names | **Fixed:** WeakSet idempotent guard (same pattern as #254) + all-tools duplicate test (RED before, GREEN after). Pre-existing on main. |
| 3 | T2 | HIGH | Hook not active in this checkout | **Accepted as sequencing:** `npm run hooks:install` runs after S5 merges (shared `.git/config`, relative path resolves per worktree). |
| 4 | T2 | HIGH | Installed harness (templates/manifest) lacks `check`/hook; `models.template.json` frontend still gpt-5.4 low | **Deferred (follow-up, harness maintainer):** template drift pre-dates Day 1 (template is on its own release cycle); runbook section scoped to the source repo. |
| 5 | T1+T2 | MED | operator-leases test dropped order assertions | **Fixed:** positional assertion of canonical store order (acquired_at ASC). |
| 6 | T2 | MED | Tuning cost index lacks `claude-opus-4-7` | **Fixed:** weight added (same tier as opus-4-5; gpt-5.5/spark gaps pre-date Day 1). |
| 7 | T1 | MED | frontend fallback hard-codes literals, bypassing capability refs; capability descriptions stale | **Fixed:** new `routing_frontend_first` capability; descriptions updated; resolved routes unchanged (54/54 routing tests). |
| 8 | T1 | MED | Hook tests working tree, not pushed commits; deletes run the suite | **Partly fixed:** delete-only pushes skip; warning when uncommitted tracked changes exist. Full "test exactly the pushed commit" deferred (would need a temp worktree per push). |
| 9 | T1 | MED | `.gitignore` hides stray nested DBs instead of fixing the root | **Accepted, deferred:** root fix (single store root for all callers) is the Week-1 item; Day 1 goal is "never commit a live DB". |
| 10 | T1 | MED | harness-package fallback may silently resolve to a scratch root | **Fixed:** assert `harness-package.json` exists under the resolved root (clear failure message verified). |
| 11 | T1 | MED | "stronger" override for frontend now goes Opus → gpt-5.5; phase-lane vs role fallback differ | **Deferred to routing owner:** semantics of the carried June 9 change; flagged in the S6 PR. |
| 12 | T1 | MED | Router derives default from `fallback_order[0]`, ignores `default_model` | **Deferred:** pre-existing resolver design; follow-up. |
| 13 | T1 | LOW | Project APPEND_SYSTEM.md shadows a global one | **Noted:** no global `~/.pi/agent/APPEND_SYSTEM.md` exists here (checked). |
| 14 | T2 | LOW | slice-dependency stderr filter too broad | **Fixed:** anchored regexes for Node's two-line deprecation notice only. |
| 15 | T2 | LOW | Literal R4 vs historical records | **Resolved by scope:** historical reports/logs exempt (plan R4). |

Plan-review items also applied in this batch: T1 ignore test hardened (global excludes disabled, source asserted; mutation-verified
against main's `.gitignore`); worker-execution/pr-lifecycle fixtures seed canonical SQLite; review verdict/status asserted;
orchestrator-context resolves tsx through package exports; `engines.node >=22.13`.

Gates after the fix batch (combined tree, lockfile deps, `STITCH_API_KEY` set): `npm run check` ×3 → exit 0 each
(unit 706/706, integration 187/187, schema + static OK).

## WIP (`fix/pi-extension-conflicts`) per-hunk disposition

| File | Disposition |
|---|---|
| `.pi/agent/models.json`, `.pi/settings.json`, `scripts/validate-harness-routing.sh`, `tests/extension-units/harness-routing.test.ts`, `tests/extension-units/project-model-settings.test.ts`, `.pi/agent/routing/{routing_notes,worker_routing_matrix}.md`, `.pi/agent/docs/{phase_model_routing,team_orchestration_architecture}.md` | **Carried in S6** (applies cleanly; main untouched since 493bb70). `frontend_worker.fallback_order` re-expressed as the `routing_frontend_first` capability with identical resolution. |
| `logs/coding/2026-06-09_frontend-worker-opus-routing.md` (untracked) | **Carried in S6** as provenance. |
| `.pi/agent/extensions/recovery.ts`, `tests/extension-units/{consolidated-modules,recovery-runtime}.test.ts` | **Superseded by #254** (idempotent split factories); not carried. |
| `.pi/agent/extensions/packets.ts`, `tests/extension-units/extension-factory-exports.test.ts` | **Superseded:** S6 applies #254's idempotent pattern to `task-packets.ts` instead of no-op'ing the facade, plus an all-tools duplicate test. |
| `logs/CURRENT.md`, `coding-logs/…weekly-summary…md` | **Not carried:** the operator's local log edits; left in their working tree. |

## QCHECK round 2 — confirm, scoped to the fix diff

Tier 2 (Codex `gpt-5.6-sol` xhigh): **no new CRITICAL/HIGH** in any framing; all round-1 findings closed; frontend route still
resolves to `[opus-4-7, gpt-5.5, spark, sonnet-4-6]`. One LOW (hook warning ignored untracked files) → **fixed**.
Tier 1 (`/code-review high`; its scope pointer covered the whole change set vs main, so it re-raised several round-1 items, all
already dispositioned above) surfaced one **verified HIGH**:

- **The idempotency guard does not hold under pi's real loader.** pi loads every extension file as a fresh module with its own
  `ExtensionAPI`, so an in-module `WeakSet<ExtensionAPI>` never sees the other file's registration. Reproduced with pi's own
  `DefaultResourceLoader` on clean `main` (0de9c1f, i.e. including #254): three conflicts —
  `resolve_recovery_policy` (recovery.ts vs recovery-policy.ts), `resolve_recovery_runtime_decision` (recovery.ts vs
  recovery-runtime.ts), `generate_task_packet` (packets.ts vs task-packets.ts). The all-tools unit test passed only because it
  shares one fake API and Node's module cache.
- **Disposition: ESCALATED (g2-qcheck 2-round cap; AGENTS.md overlapping-ownership rule).** The S6 guard and the misleading
  all-tools test were **reverted**; S6 carries the routing change only. A real fix needs a structural choice (stop auto-loading
  the facades, e.g. an explicit extension list in `.pi/settings.json`, or no-op facades as the WIP did). The no-op route edits
  `tests/integration/core-workflows.test.ts`, which the uncommitted H3b worktrees also modify. Decision requested from the operator.

Other Tier-1 round-2 LOWs: stderr filter pinned to DEP0205 (**fixed**); hook warns on pushes of non-HEAD commits (**fixed**);
`hooks:install` sets the shared `core.hooksPath` (accepted: `.git/hooks` holds only samples; worktrees without `.githooks/` keep
having no hooks, as today); nested runtime `*.json` not ignored (noted: nothing writes JSON exports any more).

Hook behaviour verified in scratch with a fake `npm`: clean push runs the check with `GIT_DIR` unset; untracked file and
non-HEAD pushes warn; delete-only push skips; failing check blocks. Real-suite push from a linked worktree: base repo unchanged.
