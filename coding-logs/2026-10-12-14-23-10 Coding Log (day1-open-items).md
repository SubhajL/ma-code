# Coding Log — Day 1 open items (2026-10-12)

Source: the "Still open" list at the end of the Day 1 hardening session
(`coding-logs/2026-10-11-13-42-43 Coding Log (day1-hardening).md`, "Open items").
Operator instruction: "Please complete above." That is taken as approval of the recommended fix for the tool conflicts
(an explicit extension list in `.pi/settings.json`, not no-op facades).
Base: `main` @ `5e7796b` (#263). Implementer: Claude (Opus 5.5).

## Items

| # | Item | Outcome |
|---|---|---|
| 1 | pi tool conflicts (3 tools registered twice) | slice P1, below |
| 2 | Routing-owner questions | the operator skipped the questions and said "continue", so the recommended defaults apply in slice R (reversible; see that section) |
| 3 | Packaging parity (`check` script and hook missing from installs) | slices P2 (pi project config: settings, append prompt, routing map) and P3 (`check`, hook) |
| 4 | Node 22 not validated | done locally, below |
| 5 | `npm ci` in the operator checkout | done, below |

## Item 5 — `npm ci` in the operator checkout

`/Users/subhajlimanond/dev/ma-code` (branch `fix/pi-extension-conflicts`, which equals `main` plus the operator's weekly-summary
log edit). Before: `tsx` 4.21.0. `npm ci` (npm 11.19.0) → `tsx` 4.23.15, matching the lockfile.
npm 11 skipped five install scripts not yet in `allowScripts` (esbuild, fsevents, koffi, protobufjs, @google/genai). The check
still passes, so none of them is needed for the harness toolchain.
`npm run check` on Node 26.7.0 → exit 0 (24.8 s): unit 705/705, integration 187/187, schema types current, static OK.

## Item 4 — Node 22

The Day 1 session found only Node 26. Homebrew's keg-only `node@22` (22.22.3, `/opt/homebrew/opt/node@22/bin`) was installed but
not on PATH. With that first on PATH (npm 10.9.8), `npm run check` → exit 0 (29.0 s): unit 705/705, integration 187/187,
schema and static OK. The only difference is Node 22's `ExperimentalWarning: SQLite is an experimental feature`, which is harmless.
Gap: `engines` says `>=22.13`, and 22.13.x itself was not tested; 22.22.3 is the oldest Node available here.

## P1 — explicit extension list (`fix/pi-explicit-extension-list`)

**Stop line:** Q0 fires. `.pi/settings.json` decides whether the runtime safety extensions (`safe-bash`, `till-done`) load,
so this is a safety-control boundary. Claude implemented it; nothing was delegated. Test → RED → fix → GREEN.

**Reproduction:** pi's real `DefaultResourceLoader` on `main` reported 3 conflicts under both the dev dependency (0.67.6) and the
operator's Homebrew pi (0.74.0): `resolve_recovery_policy` and `resolve_recovery_runtime_decision` (recovery.ts vs its split
modules) and `generate_task_packet` (packets.ts vs task-packets.ts).

**Change:** `.pi/settings.json` `extensions` goes from `["agent/extensions"]` to the 55 entry points, leaving out
`recovery.ts` and `packets.ts`. New `tests/extension-units/pi-extension-loading.test.ts` runs pi's real loader:
- test 1: no load errors, tool or flag conflicts, or duplicate commands;
- test 2: the loaded set equals what pi itself discovers from the directory (via `DefaultPackageManager.resolve()`), minus
  the facades.

The shared-fake-API test "auto-loading every top-level extension registers recovery tools exactly once" was removed. It passed
on `main` while pi reported the conflicts, because it shares one fake API and Node's module cache. Facade comments and
operator docs now say to load a facade only alone (`pi --no-extensions -e`).

**RED:** on the unchanged settings, test 1 failed on the 3 conflicts and test 2 on the extra `packets.ts` and `recovery.ts`.
**GREEN:** 55 loaded and 0 errors on 0.67.6 and on 0.74.0. The tool, command and handler surface is identical to `main`
(26 tools, 1 command, 8 handlers).
**Mutation (rewritten oracle):** each case fails the named test:
- the directory entry restored (both tests fail);
- `safe-bash.ts` dropped from the list;
- a new top-level `zz-probe.js`;
- a new `zzsub/index.ts`;
- a duplicate `/auggie-status` command (test 1).

### QCHECK R1 (framings in parallel: contract, adversarial, merged-artifact)

Tier 1 was `/code-review high` (Claude workflow, 38 tool uses, no errored finders). Tier 2 was Codex `gpt-5.6-sol` xhigh, read-only:
28-line report with `file:line` citations and its own mutation checks. Tier 2 was mandatory (config change on a safety boundary).

| # | Tier | Sev | Finding | Disposition |
|---|---|---|---|---|
| 1 | T1+T2 | HIGH | The installer ships `.pi/agent/settings.json` but not `.pi/settings.json`. Installed repos load 0 extensions, and the new test fails there. | **Fixed in P2** (packaging, next PR). The 0-extension gap predates P1 and was confirmed with the loader in a temp install. |
| 2 | T1+T2 | HIGH | The completeness oracle counted only top-level `.ts` files. Directory discovery also takes `.js`, symlinks, and subdir `index`/manifest entries. | **Fixed:** the oracle asks pi's `DefaultPackageManager` what the directory would discover. Mutation-verified with `.js` and `subdir/index.ts`. |
| 3 | T1 | MED | Docs said "load a facade with `pi -e`", but `-e` merges with settings, so the conflicts return. | **Fixed:** `pi --no-extensions -e …`. Loader probe: plain `-e` gave 56 extensions and 2 errors; `--no-extensions` gave 1 and 0. |
| 4 | T1+T2 | MED | `auggie_mcp_integration_contract.md:26` still showed `extensions: ["agent/extensions"]`. | **Fixed.** |
| 5 | T1 | MED | pi's conflict check covers tools and flags only, not duplicate commands. | **Fixed:** test 1 also fails on a duplicate slash command (mutation-verified). Duplicate event handlers can't be told apart from legitimate listeners and stay unchecked. |
| 6 | T2 | MED | `validate-extension-unit-tests.sh` copies the new test but does not run it. | **Deferred (H3b owns that file).** `npm run check` and the pre-push hook run it through the `test:extensions` glob. |
| 7 | T1 | MED | The test pins pi 0.67.6 (dev dependency); the operator runs 0.74.0. | **Deferred (harness maintainer):** dev dependency vs CLI drift predates P1. 0.74.0 was checked by hand here (55 loaded, 0 errors). |
| 8 | T1 | LOW | Altitude: `["agent/extensions", "!…recovery.ts", "!…packets.ts"]` would keep auto-discovery. | **Rejected:** the operator chose the explicit list. It also makes registering an extension (which can intercept tool calls) a deliberate edit, and test 2 now catches any extension left out. |
| 9 | T1 | LOW | 35 listed modules register nothing (helpers with no-op factories); "directory autoload" comments remain in ~12 files. | **Deferred:** they loaded under the directory form too, so this is no regression. Several of those files are H3b-owned. Trimming the list needs a per-module audit. |

### QCHECK R2 (confirm, scoped to the R1 fix diff)

Tier 1 (`/code-review high`, 25 tool uses) checked the oracle's isolation: it passes from an unrelated cwd with a fake `HOME`
and leaves no files behind. It found no CRITICAL or HIGH. Tier 2 (Codex `gpt-5.6-sol` xhigh): no CRITICAL or HIGH, fixes 1–2
confirmed, fix 3 (Auggie wording) not confirmed. That is the same item as T1 #4 below, already fixed in this batch. Codex
started before the batch was applied.

| # | Tier | Sev | Finding | Disposition |
|---|---|---|---|---|
| 1 | T1 | MED | The R1 advice `pi --no-extensions -e <facade>` also drops `safe-bash`, `till-done` and every other extension. | **Fixed:** the guide and facade comments now say facades are for imports and re-exports only and must not be loaded into pi; both `-e` forms are named with their consequence. |
| 2 | T1 | MED | A stale or misspelled settings entry is skipped silently by pi, so both tests stayed green. | **Fixed:** new test 3 checks that every listed entry loads. Mutation: adding `agent/extensions/nonexistent.ts` fails it. |
| 3 | T1 | LOW | The guide said "registered twice"; pi and the new check only compare across extensions. | **Fixed:** "registered by two extensions". |
| 4 | T1+T2 | MED | The Auggie contract said "lists each file explicitly" although the facades are left out. | **Fixed:** "lists the extension entry points one by one (the composite facades … are left out)". |
| 5 | T1 | LOW | The split modules' `WeakSet` guards are dead weight under pi's loader. | **Rejected:** they still protect composing the factories on one API, pinned by `consolidated-modules.test.ts` "recovery composite and split factories register once in either order". |
| 6 | T1 | LOW | Altitude (exclude patterns) and helper modules on the list: repeats of R1 #8 and #9. | Same dispositions as R1. |
| 7 | T1 | LOW | The `-e` example used a cwd-relative path. | **Moot:** the example was removed by #1. |

Gates after the batch: focused tests 3× (8/8), `npm run check` exit 0 (unit 707/707, integration 187/187, schema, static).
Land: R2 surfaced zero CRITICAL/HIGH, and every MEDIUM is fixed. The two-round cap is respected.

**H3b note:** after this lands, the H3b worktrees must add `agent/extensions/task-quality.ts` to `.pi/settings.json` when they
rebase. Otherwise test 2 fails with the actionable message (by design).
