# DREP — Day 1 hardening (Pi harness)

- Date: 2026-10-11
- Base: `main` @ `0de9c1f` (includes #253–#257)
- Source spec: "Suggested order → Day 1" of the 2026-10-10 independent review (see §1 Source spec)

## §0 Repo Profile

- Root: `/Users/subhajlimanond/dev/ma-code`. Work happens in sibling worktrees `../ma-code-day1-sN` on bounded branches; never on `main`.
- Languages: TypeScript (ESM, loaded via `tsx` 4.21), bash, python3 (static check heredoc). Local Node v26.7.0 / npm 11.19.0; CI pins Node 22.
- Test: `npm run test:extensions` (= `node --experimental-sqlite --import tsx --test tests/extension-units/*.test.ts`), `npm run test:integration` (= `scripts/run-integration-tests.mjs` → `node --import tsx --test tests/integration/*.test.ts`).
- Typecheck: `npm run typecheck` (`tsc --noEmit`). Lint: none. Build: none.
- Static/invariants: `./scripts/check-repo-static.sh` (CI step 1), `npm run check:schema-types`.
- Migration policy: SQLite runtime migrations (`lib/runtime-migrations.ts`) — not touched by this plan.
- Coding-log convention: two exist. Pi: `logs/CURRENT.md` → `logs/coding/…`. Claude Code: `.codex/coding-log.current` → `coding-logs/<ts> Coding Log (<slug>).md`. This work uses the Claude Code convention (g2-check requires it). The plan itself is committed at `reports/planning/2026-10-11_day1-hardening-plan.md`.
- Ownership: repo ours · runtime ours · disposition production (harness is installed into other repos).
- MUST NOT (AGENTS.md, verbatim intent):
  - never edit `main` directly; branch/worktree per change; small reversible changes; do not widen scope silently;
  - no destructive shell; do not modify `.env*`, secrets, protected paths (`.env*`, `.git/`, `node_modules/`, `.pi/agent/state/runtime/`) without explicit instruction;
  - do not edit runtime JSON/SQLite directly; do not disable tests or checks to make a task pass;
  - no history rewrite / force push; human approval for protected paths, auth/secrets, deployment-critical config;
  - ADRs win over other docs; escalate when two workers need overlapping file ownership.
- **Concurrency constraint (load-bearing):** uncommitted H3b work lives in `../ma-code-h3b`, `../ma-code-h3b-complete`, `../ma-code-h3b-plan`. It modifies: `lib/coordinated-state.ts`, `lib/runtime-migrations.ts`, `lib/tasks-state.ts`, `pr-lifecycle.ts`, `queue-runner.ts`, `slice-lifecycle.ts`, `till-done.ts`, `worker-execution.ts`, `state/schemas/tasks.schema.json`, `docs/adr/README.md` (+ new ADR-0011), `logs/CURRENT.md`, `tests/extension-units/{pr-lifecycle,queue-runner,slice-lifecycle,till-done,worker-execution}.test.ts`, `tests/integration/core-workflows.test.ts`, `scripts/validate-core-workflows.sh`, `scripts/validate-extension-unit-tests.sh`. **No Day 1 slice modifies any of these.** ADR number 0011 is taken by H3b ⇒ no new ADR in Day 1.
- Protected-path approval: S5 changes local `.git/config` `core.hooksPath` (current value `/Users/subhajlimanond/dev/ma-code/.git/hooks`, which holds only `*.sample` files). Approved via the user's goal "complete day 1 works" which explicitly includes the pre-push hook. Reversible: `git config core.hooksPath /Users/subhajlimanond/dev/ma-code/.git/hooks`.

## §1 Goal / Non-Goals

**Source spec (Day 1, verbatim from the review):** "rename `SYSTEM.md` → `APPEND_SYSTEM.md`; add `pi.db` to `.gitignore`; set the auto-land policy to `enabled: false` or write the ADR; add `npm run check`, the pre-push hook and a lockfile; fix the 21 integration failures; rebase this branch onto `main`." Plus user question: "Does pi have pre-push hook and a lockfile?" (answer: no — neither exists today).

**Goal.** Land Day 1 as six small, independently reviewable PRs on `main`, each validated locally (CI is billing-blocked), so that: pi sessions in this repo get pi's default system prompt + every extension's tool guidance; live runtime DBs cannot be committed; the default auto-land behaviour matches ADR-0002; the full local suite is green and one command proves it, enforced by a tracked pre-push hook on top of a committed lockfile; and the June 9 frontend-routing WIP lands on current `main` without re-introducing the duplicate-registration conflict.

**Non-Goals.**
- CI workflow restructuring (billing-blocked; follow-up).
- Week-1 items: runtime-store root (H1 for all callers), N1 lock/freeze, lost-update API, safe-bash parser, sandboxing.
- Any production-code change to pr-lifecycle / worker-execution / afk-orchestration / till-done (H3b-owned or out of scope).
- Deleting the 8 stray nested `pi.db` files (protected; operator decision).
- Re-converting `frontend_worker.fallback_order` from literal IDs back to capability refs (keeps the developer's June 9 intent; follow-up).
- README rewrite; doc consolidation; cleaning `worker/*` branches; touching the original dirty working tree or H3b worktrees.
- Writing a new ADR (number collision with H3b's ADR-0011).

## §2 Requirements

- **R1** `git check-ignore --no-index` reports ignored for `.pi/agent/state/runtime/pi.db`, `…/pi.db-wal`, `…/pi.db-shm`, and a nested `logs/.pi/agent/state/runtime/pi.db`.
- **R2** `check-repo-static.sh` fails when any `pi.db*` under any `.pi/agent/state/runtime/` is tracked.
- **R3** For this repo, pi's `DefaultResourceLoader` (isolated `agentDir`) yields `getSystemPrompt() === undefined` and `getAppendSystemPrompt()` contains the project guidance heading `# Pi Project System Guidance`.
- **R4** Current operator docs that name `.pi/SYSTEM.md` name `.pi/APPEND_SYSTEM.md` instead. Historical `reports/`, `logs/` and `coding-logs/` entries are immutable records and are exempt.
- **R5** The repo's default auto-land policy file has `enabled: false`; explicit `--auto-land --approval-ref` behaviour is unchanged (existing orchestrator-run tests keep passing).
- **R6** `npm run test:integration` exits 0 on `main`+S4 with `STITCH_API_KEY` set in the parent env and `HARNESS_SOURCE_ROOT` unset (observed 187 tests: `orchestrator-context` loads 3 tests once its loader resolves; the key leak is a conditional 22nd failure).
- **R7** R6 is achieved with test-side changes only: no production file changes; no test deleted, skipped, or `todo`-ed; no assertion weakened beyond replacing a JSON-file read with the canonical SQLite read (or an order-free lookup where order was never a product contract).
- **R8** `npm run check` exists and runs, fail-fast: typecheck → test:extensions → test:integration → check:schema-types → check-repo-static.
- **R9** Tracked `.githooks/pre-push` runs `npm run check` and blocks the push on failure; `npm run hooks:install` sets `core.hooksPath=.githooks`; hook is active in this checkout.
- **R10** `package-lock.json` is committed; `npm ci` succeeds from it in a fresh worktree and `npm run check` passes there.
- **R11** `frontend_worker` resolves to `anthropic/claude-opus-4-7` (thinking high) both by default and via `phaseLane: frontend_implementation`; backend/infra unchanged; `.pi/settings.json` enabledModels use dash IDs; static pins updated; no duplicate tool registration (main's #254 approach retained; WIP `recovery.ts`/`packets.ts` edits dropped).
- **R12** `harness_runbook.md` points operators at `npm run check` instead of the nonexistent `npm run validate:extension-unit-tests`.

## §3 Change Contract

| ID | Slice | Path | Action | Anchor | Purpose |
|---|---|---|---|---|---|
| F1 | S1 | `.gitignore` | MODIFY | runtime block (L6–10) | ignore `**/.pi/agent/state/runtime/pi.db*` |
| F2 | S1 | `scripts/check-repo-static.sh` | MODIFY | `tracked_runtime` git ls-files (L225–240) | add `:(glob)**/.pi/agent/state/runtime/pi.db*` pathspec |
| F3 | S1 | `tests/extension-units/runtime-state-ignore.test.ts` | CREATE | — | R1 oracle |
| F4 | S1 | `reports/planning/2026-10-11_day1-hardening-plan.md` | CREATE | — | committed plan |
| F5 | S1 | `coding-logs/2026-10-11-… Coding Log (day1-hardening).md`, `.codex/coding-log.current` | CREATE/MODIFY | — | coding log + pointer |
| F6 | S2 | `.pi/SYSTEM.md` → `.pi/APPEND_SYSTEM.md` | RENAME | whole file | stop replacing pi's default prompt |
| F7 | S2 | `.pi/agent/docs/operator_workflow.md` | MODIFY | L377 | doc reference |
| F8 | S2 | `tests/extension-units/project-system-prompt.test.ts` | CREATE | — | R3 oracle via real pi loader |
| F9 | S3 | `.pi/agent/routing/orchestrator-auto-land-policy.json` | MODIFY | `enabled` | `true` → `false` |
| F10 | S3 | `tests/extension-units/orchestrator-run.test.ts` | MODIFY | append one test | R5 guard |
| F11 | S4 | `tests/integration/afk-orchestration.test.ts` | MODIFY | `writeFixture`, apply test L53 | create HITL artifact `docs/foundation.md`; read queue via `readQueueState` |
| F12 | S4 | `tests/integration/operator-leases.test.ts` | MODIFY | list test L63–66; `readLeaseIds` L45–50 | order-free lookup by id; read leases via `readExecutionLeaseState` |
| F13 | S4 | `tests/integration/queue-session.test.ts` | MODIFY | queue readers ~L101–105 (+any JSON reads) | canonical SQLite reads/writes |
| F14 | S4 | `tests/integration/task-reconcile.test.ts` | MODIFY | L71, L93 | read tasks via `readTasksState` |
| F15 | S4 | `tests/integration/pr-lifecycle.test.ts` | MODIFY | `fixture()` worker.steps.coding; task seed | add `redCommand`/`greenCommand` (#257 contract); seed task via `writeTasksState` |
| F16 | S4 | `tests/integration/worker-execution.test.ts` | MODIFY | Phase C run args / expectation ~L100–115; queue seed | pass `--review-verdict no_required_fixes`; assert review step passed + verdict; seed queue via `writeQueueState` |
| F17 | S4 | `tests/integration/orchestrator-context.test.ts` | MODIFY | L1–20 tsx resolution + hard-coded home path | default deps root to the checkout; resolve tsx through package exports (`require.resolve("tsx")`) |
| F18 | S4 | `tests/integration/slice-dependency-decision.test.ts` | MODIFY | stderr `/^$/` assertion | ignore Node `DeprecationWarning` lines only |
| F19 | S4 | `tests/integration/harness-package.test.ts` | MODIFY | L21–22 | default `HARNESS_SOURCE_ROOT` to repo root when unset |
| F20 | S4 | `tests/integration/live-stitch-artifact.test.ts` | MODIFY | env spread ~L95 | strip `STITCH_API_KEY` from child env |
| F21 | S5 | `package.json` | MODIFY | `scripts`; `engines` | add `check`, `hooks:install`; declare `node >=22.13` |
| F22 | S5 | `package-lock.json` | CREATE | — | lockfile from fresh `npm install` |
| F23 | S5 | `.githooks/pre-push` | CREATE (0755) | — | run `npm run check` |
| F24 | S5 | `.pi/agent/docs/harness_runbook.md` | MODIFY | L436 + quick-reference table | `npm run check`, hook install/bypass |
| F25 | S6 | `.pi/agent/models.json`, `.pi/settings.json` | MODIFY | `frontend_worker`, `phase_routing_profiles.frontend_implementation`, `enabledModels`, notes | carry WIP |
| F26 | S6 | `tests/extension-units/harness-routing.test.ts`, `tests/extension-units/project-model-settings.test.ts`, `scripts/validate-harness-routing.sh` | MODIFY | WIP hunks | carry WIP |
| F27 | S6 | `.pi/agent/routing/routing_notes.md`, `.pi/agent/routing/worker_routing_matrix.md`, `.pi/agent/docs/phase_model_routing.md`, `.pi/agent/docs/team_orchestration_architecture.md` | MODIFY | WIP hunks | carry WIP docs |
| F28 | S6 | `scripts/check-repo-static.sh` | MODIFY | phase-profile pin tuple L1568 | `frontend_implementation` → opus-4-7 / spark fallback |
| F29 | S6 | `logs/coding/2026-06-09_frontend-worker-opus-routing.md` | CREATE (carried untracked file from the WIP tree, not part of `git diff`) | — | provenance of the carried change |

## §4 Function Contracts

Only test helpers and npm scripts are introduced; no production functions change.

- **FN1** `npm run check` (F21): `npm run typecheck && npm run test:extensions && npm run test:integration && npm run check:schema-types && ./scripts/check-repo-static.sh`. Fail-fast via `&&`; exit code = first failing step.
- **FN2** `npm run hooks:install` (F21): `git config core.hooksPath .githooks`. Idempotent. Relative path ⇒ each worktree resolves its own `.githooks/`.
- **FN3** `.githooks/pre-push` (F23): POSIX `sh`; `set -eu`; prints a one-line banner; runs `npm run check`; on failure prints "push blocked; fix or use `git push --no-verify`" and exits non-zero. Reads nothing from stdin (pre-push ref lines ignored); no network.
- **FN4** test helpers (F11–F14): use the real lib readers `readQueueState(cwd)` (`lib/queue-state.ts`), `readTasksState(cwd)` (`lib/tasks-state.ts`), `readExecutionLeaseState(cwd)` (`execution-leases.ts`) — import only, never modify these modules.

## §5 Test Plan

- **T1** `runtime state files are git-ignored` — File F3 · Covers R1 · Type: integration (real `git -c core.excludesFile=/dev/null check-ignore --no-index --verbose`; asserts the matching source is the repo `.gitignore`, so global excludes cannot satisfy it) · Arrange: repo root · Act: check-ignore 4 paths · Assert: exit 0 for each · RED-proof: before F1, `pi.db`/`-wal`/`-shm` and nested path exit 1 → assertion fails on the first path (not a spawn error). Edge: nested path.
- **T2** static-check tracked-DB guard — manual, recorded: scratch clone, `git add -f .pi/agent/state/runtime/pi.db`, run `check-repo-static.sh` · Covers R2 · Assert: non-zero exit with "runtime" message · RED-proof: before F2 the scratch run exits 0 with the DB tracked.
- **T3** `project system prompt is appended, not replacing pi's default` — File F8 · Covers R3 · Type: integration (real `DefaultResourceLoader`, temp `agentDir` so the user's global `~/.pi/agent/SYSTEM.md` cannot leak in) · Act: `await loader.reload()` · Assert: `getSystemPrompt() === undefined`; `getAppendSystemPrompt().join("\n")` includes `# Pi Project System Guidance` · RED-proof: with `.pi/SYSTEM.md` present, `getSystemPrompt()` returns the guidance string → first assert fails.
- **T4** doc reference — `rg -n '\.pi/SYSTEM\.md'` over tracked non-log files returns 0 · Covers R4 · RED: returns `operator_workflow.md:377` before F7.
- **T5** `repo default auto-land policy keeps worker jobs stopped before PR` — File F10 · Covers R5 · Type: behavioural unit (`runOrchestratorRun` against a temp repo holding the *shipped* policy file) · Assert: no `autoLand`, status `stopped`, single delegated call with `--stop-before-pr` · RED-proof: fails with `true !== false` before F9. Plus existing orchestrator-run unit/integration tests (which write their own temp policies) stay green.
- **T6** the 21 currently failing integration tests — Files F11–F19 · Covers R6, R7 · Type: integration (real CLIs, real SQLite) · RED-proof: recorded failures on `main` (ENOENT on legacy JSON; `lease-stale-queue` vs `lease-active-queue`; `[] vs [issue-002, issue-003]`; `HARNESS_SOURCE_ROOT must be set`; `ERR_PACKAGE_PATH_NOT_EXPORTED`; DEP0205 stderr; `createReady false`; `blocked` vs `review_ready`).
- **T7** `live-stitch-artifact` with key present — F20 · Covers R6 · Act: `STITCH_API_KEY=dummy npm run test:integration` · Assert: passes · RED-proof: fails today when the parent env has a key (key leaks into the child CLI).
- **T8** `npm run check` green + red — Covers R8 · Assert: exit 0 on clean S5 tree; in a scratch copy with a deliberately failing test, exits non-zero at the test step · RED-proof: `npm run check` → "Missing script" before F21.
- **T9** hook blocks push — scratch clone + local bare remote; `hooks:install`; failing test committed; `git push` → rejected; passing tree → accepted · Covers R9 · RED-proof: without the hook the failing push succeeds.
- **T10** lockfile reproducibility — fresh worktree: `npm ci && npm run check` · Covers R10 · RED-proof: `npm ci` errors "can only install with an existing package-lock.json" before F22.
- **T11** routing — WIP tests in `harness-routing.test.ts` / `project-model-settings.test.ts` + `npm run validate:harness-routing` · Covers R11 · RED-proof: on `main`, frontend default resolves to `openai-codex/gpt-5.3-codex-spark` and enabledModels contain dot IDs → those asserts fail.
- **T12** no duplicate registration — existing `extension-factory-exports.test.ts` "auto-loading every top-level extension does not register duplicate tools" stays green after S6 · Covers R11 · RED-proof: if WIP `recovery.ts` no-op were carried, `core-workflows` would fail 9/10 (observed on the WIP tree).
- **T13** runbook — `rg -n 'validate:extension-unit-tests' .pi/agent/docs/harness_runbook.md` → 0 hits; `rg 'npm run check'` ≥1 · Covers R12.

## §6 Traceability Matrix

| Req | Realized at (call site) | Tests | Files | Slice |
|---|---|---|---|---|
| R1 | `.gitignore` rule `**/.pi/agent/state/runtime/pi.db*` consumed by git | T1 | F1,F3 | S1 |
| R2 | `check-repo-static.sh` `tracked_runtime = subprocess.check_output([... "ls-files", ...pathspecs])` L225 | T2 | F2 | S1 |
| R3 | pi `resource-loader.js:661` (SYSTEM.md discovery) finds nothing; `:672` (APPEND_SYSTEM.md) loads F6 → `system-prompt.js` default branch adds snippets/guidelines | T3 | F6,F8 | S2 |
| R4 | `operator_workflow.md:377` text | T4 | F7 | S2 |
| R5 | `orchestrator-run.ts:165-167 loadDefaultAutoLandPolicy` → `:175 applyDefaultAutoLandPolicy` returns input unchanged when `!policy.enabled` | T5 | F9,F10 | S3 |
| R6/R7 | each test's own assertion against canonical readers / fixtures | T6,T7 | F11–F20 | S4 |
| R8 | `package.json scripts.check` | T8 | F21 | S5 |
| R9 | git invokes `$core.hooksPath/pre-push` → FN3 → `npm run check` | T9 | F21,F23 | S5 |
| R10 | `npm ci` reads F22 | T10 | F22 | S5 |
| R11 | `harness-routing.ts resolveHarnessRoute` reads F25 `routing_defaults.frontend_worker` / `phase_routing_profiles.frontend_implementation`; static pin F28 | T11,T12 | F25–F29 | S6 |
| R12 | runbook L436 | T13 | F24 | S5 |

## §7 Wiring Verification

| Component | Runtime caller | Registration | Notes |
|---|---|---|---|
| `.pi/APPEND_SYSTEM.md` | pi `DefaultResourceLoader.reload()` | filename convention (`CONFIG_DIR_NAME/APPEND_SYSTEM.md`) | verified in `resource-loader.js:672` |
| policy JSON | `orchestrator-run.ts:464` | fixed path `DEFAULT_AUTO_LAND_POLICY_PATH` L110 | unchanged code |
| `npm run check` | `.githooks/pre-push`; humans; runbook | `package.json` | — |
| `.githooks/pre-push` | git on `push` | `core.hooksPath` via `hooks:install` | executable bit committed (`git update-index --chmod=+x`) |
| `package-lock.json` | `npm ci` | npm | — |
| new tests F3/F8/F10 | `test:extensions` glob `tests/extension-units/*.test.ts` | glob | auto-discovered |

## §8 Slice Plan

All owner **Claude**, stop line **n/a — no delegation** (Q0: each slice is config/test/doc-sized; delegation overhead exceeds the work; S4 needs root-cause judgment per test). One PR each, landed in order, each branched from latest `main` after the previous merge.

| ID | Branch | Scope | Oracle | Done when |
|---|---|---|---|---|
| S1 | `chore/day1-s1-ignore-runtime-db` | F1–F5, T1–T2 | T1 + T2 + static check + test:extensions | merged |
| S2 | `fix/day1-s2-append-system-prompt` | F6–F8, T3–T4 | T3, T4, test:extensions, static check | merged |
| S3 | `fix/day1-s3-disable-default-auto-land` | F9–F10, T5 | T5 + orchestrator-run tests | merged |
| S4 | `test/day1-s4-integration-green` | F11–F20, T6–T7 | integration 185/185 (with key set) + test:extensions + typecheck | merged |
| S5 | `chore/day1-s5-check-hook-lockfile` | F21–F24, T8–T10, T13 | `npm ci && npm run check` in fresh worktree; T9 scratch push | merged; hook installed locally |
| S6 | `feat/day1-s6-frontend-opus-routing` | F25–F29, T11–T12 | `npm run check` (incl. static) + `validate:harness-routing` | merged |

Per-slice gate before commit: g2-qcheck (independent reviewer — Codex CLI) on the diff; findings dispositioned in the coding log.

## §9 Risks, Rollout, Rollback

- **APPEND switch changes prompt composition** (pi default prompt + tool guidance now included; slightly more tokens). Rollback: `git mv .pi/APPEND_SYSTEM.md .pi/SYSTEM.md`.
- **Disabling default auto-land reverses a 2026-05-10 standing choice.** Justification: ADR-0002 + runbook "HUMAN GATE" win per AGENTS.md; the merge path still has a zero-check stacked-base bypass. Explicit `--auto-land --approval-ref` unchanged. Rollback: flip `enabled`.
- **Pre-push hook adds ~25–40 s per push**; bypass `git push --no-verify`. `core.hooksPath` is shared by all worktrees of this repo; worktrees without `.githooks/` (e.g. H3b worktrees until rebased) simply have no hook — same as today. Rollback: restore previous hooksPath value (recorded in §0).
- **Lockfile pins today's resolution**; CI still uses `npm install` (follow-up to switch to `npm ci`).
- **S4 semantic overlap with H3b:** S4 fixture updates encode #257's current contract (redCommand/greenCommand; pending review). When H3b lands its proof-authority change it may need to re-touch these two integration tests — flagged in the PR body; no file overlap today.
- **S6 carries another author's WIP.** Provenance kept via F29 log; original dirty tree left untouched for the owner to discard.

## §11 Plan-review synthesis (Codex `gpt-5.6-sol`, xhigh, 21 findings)

| # | Sev | Finding (short) | Disposition |
|---|---|---|---|
| 1 | HIGH | No in-place rebase of `fix/pi-extension-conflicts` | **Accepted, modified.** S6 lands every routing hunk on `main`; the coding log carries a per-hunk disposition table. The operator's dirty checkout is not stashed/reset by the agent (repo rule: "no blanket stash"); the final switch is left to the operator. |
| 2 | HIGH | Delegate production/config edits to Luna | **Rejected.** That is Codex's own workflow; this work follows g2-coding Q0–Q3 (Q0 for S3/S5; S1/S2/S4/S6 trivial). |
| 3 | HIGH | Record #254 conflict resolution per hunk | **Accepted.** Table in coding log; main's idempotent registration retained; WIP `recovery.ts`/`packets.ts`/3 tests not carried. |
| 4 | HIGH | F29 not in wip.patch | **Rejected.** It is an untracked file in the WIP tree (`git diff` omits untracked files); F29 relabelled. |
| 5 | HIGH | 185 count wrong after F17 | **Accepted.** R6 now requires exit 0; observed 187. |
| 6 | HIGH | F16 could weaken review contract | **Accepted.** Explicit verdict + asserts on review status/verdict and `review_ready`. |
| 7 | HIGH | F18 leaves the `--trace-deprecation` line | **Rejected.** Filter matches `DeprecationWarning` and `--trace-deprecation`; passes on Node 26. Broadened deliberately: the test asserts the CLI emits no diagnostics of its own. |
| 8 | MED | F11 under-specified | **Accepted** (both changes implemented, all assertions kept). |
| 9 | MED | Legacy JSON writers left behind | **Accepted.** All touched integration tests now seed and read through canonical lib writers/readers. |
| 10 | MED | F19 may expose secondary failures | **Accepted** (all six cases run green). |
| 11 | MED | Direct `dist/loader.mjs` path brittle | **Accepted** for orchestrator-context (`require.resolve("tsx")`); other integration files keep the existing idiom (verified on tsx 4.21 and 4.23). |
| 12 | MED | Add negative RED/GREEN assertion | **Rejected.** Covered by `tests/extension-units/pr-lifecycle.test.ts:42,130` on main (#257). |
| 13 | MED | F20 is a conditional 22nd failure | **Accepted** (labelled in R6). |
| 14 | MED | T1 vacuous via global excludes | **Accepted.** T1 hardened; mutation-verified against main's `.gitignore`. |
| 15 | MED | R4 vs historical reports | **Accepted.** Historical records exempt; root `SYSTEM.md` untouched. |
| 16 | MED | T5 only parses JSON | **Accepted** (behavioural test against the shipped policy). |
| 17 | MED | Package template/manifest lack `check`/`.githooks` | **Accepted, deferred.** Runbook section scoped to the harness source repo; packaging parity is a follow-up. |
| 18 | MED | Lock every WIP routing literal | **Rejected.** `harness-routing.test.ts` asserts resolved routes (behaviour) plus the static phase tuple; pinning every literal adds the brittleness the review criticised. |
| 19 | MED | Hook masks global LFS pre-push; rollback wrong | **Rejected.** Local `core.hooksPath=.git/hooks` already overrides the global value (`git config --show-origin`), so the global hook is inactive here today; no `.gitattributes`/LFS in the repo. Rollback restores that local value. |
| 20 | LOW | `npm ci` under `NODE_ENV=production` | Noted; not changed. |
| 21 | LOW | Declare Node `>=22.13` | **Accepted** (`engines`). Node 22 not installed locally; validated on Node 26 only. |

## §10 Do-Not-Touch

- All H3b-owned files listed in §0.
- `.pi/agent/state/runtime/**` and every nested `*/.pi/agent/state/runtime/**` (including the 8 stray `pi.db`).
- Production code in S4: everything under `.pi/agent/extensions/**` and `scripts/**` except F2/F28 (static check) in S1/S6.
- `.env*`; `.git/**` except the single `core.hooksPath` config change in S5.
- The original working tree `/Users/subhajlimanond/dev/ma-code` (branch `fix/pi-extension-conflicts`) and the H3b worktrees.
- WIP files intentionally NOT carried in S6: `.pi/agent/extensions/recovery.ts`, `.pi/agent/extensions/packets.ts`, `tests/extension-units/consolidated-modules.test.ts`, `tests/extension-units/extension-factory-exports.test.ts`, `tests/extension-units/recovery-runtime.test.ts`, `logs/CURRENT.md`, `coding-logs/2026-05-26-… weekly-summary…md`.
