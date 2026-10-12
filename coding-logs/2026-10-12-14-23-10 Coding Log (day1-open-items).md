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

## Slice R — frontend routing fallbacks (`fix/frontend-routing-fallbacks`)

**Decision source:** the routing-owner questions were put to the operator, who skipped them and said "continue". The
recommended answers apply, and each is reversible with a one-line config change:
1. **Frontend `task_harder` stays on Opus 4.7.** The resolver's "stronger override" takes the second model in a role's
   fallback order, which moved frontend from Opus to gpt-5.5. New role flag `allow_stronger_override` (default `true`);
   `frontend_worker` sets it to `false`. Thinking still rises (high → xhigh). To revert, delete the flag from `models.json`.
2. **An Opus outage falls back to gpt-5.5 everywhere.** The `frontend_implementation` lane's `fallbackModelId` was
   gpt-5.3-codex-spark, which disagreed with the role order (Opus → gpt-5.5 → spark → Sonnet). It is now gpt-5.5.
3. **Phase lanes skip failed models (all lanes).** Found while probing: with `phaseLane` set, a verified lane re-selected its
   model even when it was in `failedModels`, so after an Opus outage the frontend lane picked Opus again. The same was true
   for spark on `backend_implementation` and gpt-5.5 on `screen_design`. A lane whose model (verified or fallback) is listed
   as failed now keeps the role's fallback route and reports `phaseRoutingSource: "failed_model_fallback"`. This new value
   contains "fallback", so the existing consumers (packet generators, `validate-task-packets.sh`) match it unchanged.

**Stop line:** Q2 applies (several files, one config shape). Not delegated: the implementation is about 30 lines inside
`resolveHarnessRoute` and the config parser, so a brief would cost more than the work (same rationale as Day 1).
Test → RED → implement → GREEN.

**RED (5 new tests, each for the predicted reason):**
- frontend `task_harder` got gpt-5.5;
- frontend lane with Opus failed got Opus;
- the all-lanes test found `frontend_implementation` re-selecting failed Opus;
- an unverified lane re-selected its failed spark fallback;
- the lane fallback (spark) ≠ the role's second model (gpt-5.5).

**Changed expectations (intended):**
- `orchestration-helpers` "raises cheaper build-worker defaults … for harder tasks" now uses `backend_worker`, the cheap
  build worker (spark → gpt-5.5, xhigh). Frontend is no longer cheap.
- `harness-routing` "unavailable phase profile falls back" expects gpt-5.5, the new frontend lane fallback.
- `validate-harness-routing.sh`: "frontend harder task keeps opus", plus new "backend harder task stronger override" and
  "frontend phase lane after opus failure" cases.
- `check-repo-static.sh`: the frontend lane fallback pin.

**Mutation (code written before its test):** the `allow_stronger_override` type check was removed, which fails "must be a
boolean when present". With the role flag ignored in the resolver, "a harder frontend task stays on Claude Opus" fails.

**Gates:** routing tests 3× (59/59), `validate-harness-routing.sh` PASS, `npm run check` exit 0 (unit 714/714, integration
187/187, schema, static).
**Docs:** `routing_notes.md`, `worker_routing_matrix.md`, `phase_model_routing.md`, `operator_model_routing_guide.md`.

### QCHECK R1 — slice R (framings in parallel: contract, adversarial, merged-artifact)

Tier 1 was `/code-review high` (18 tool uses; it probed `resolveHarnessRoute` directly). Tier 2 was Codex `gpt-5.6-sol` xhigh,
read-only: a 30-line report with `file:line` citations and requirement verdicts. Tier 2 was mandatory (routing-policy
semantics and config). Neither tier raised a CRITICAL or HIGH.

| # | Tier | Sev | Finding | Disposition |
|---|---|---|---|---|
| F1 | T1 | MED | When a verified lane's model failed, the lane kept the role route, which could be a budget or stronger override (frontend + budget_pressure + Opus failed → `gpt-5.4-mini`, low). | **Fixed:** lanes try [verified, fallback] minus failed models, then the first role fallback. Test: "a lane whose model failed uses its own fallback, not a budget or stronger role override". Mutation: dropping the lane fallback fails "agree on gpt-5.5". |
| F2 / M1 | T1+T2 | MED | A bare failed id was normalized with the role's provider, so `["claude-opus-4-7"]` for backend_worker or `["gpt-5.5"]` for frontend_worker missed the real model. This also let a failed `modelOverride` win under `human_override`. | **Fixed:** `isFailed` matches a bare id against the model part; it is used for role fallbacks, budget overrides and lanes. Two tests; the mutation fails both. |
| F3 | T1 | MED | An unverified lane whose fallback failed could fall through to its own unverified target. | **Fixed:** that target is skipped on the role path, and the resolver throws if nothing remains. Test strengthened; mutation-verified. |
| F4 | T1 | LOW | The matrix's frontend "fallback column" is stale. | **Rejected:** the column is "Allowed Overrides" (`worker_routing_matrix.md:5`). `frontend_worker.allowed_overrides` is `routing_implementation_first` minus the default, i.e. spark; gpt-5.5; sonnet, which is what the row shows. |
| F5 | T1 | LOW | The policy note "keeps X" could contradict the final model (with a phase lane, or after a failure). | **Fixed:** the note names no model and appears only when a stronger move was possible. |
| F6 | T1 | MED | The stronger override takes `availableFallbacks[1]`, so after a failure backend + task_harder + spark failed picks Sonnet over gpt-5.5. | **Deferred (routing follow-up):** this resolver rule predates the slice. A root fix (per-role stronger list, or no second step after a failure) changes non-frontend routing. |
| F7 | T1 | LOW | Docs said budget mode `high` raises thinking; it doesn't. | **Fixed** (`routing_notes.md`). |
| L1 | T2 | LOW | Budget mode `high` was only tested together with `task_harder`. | **Fixed:** new test; mutation (budget stronger ignored) fails it. |

Gates after the batch: routing tests 3× (63/63), `validate-harness-routing.sh` PASS, `npm run check` exit 0 (unit 718/718,
integration 187/187).

### QCHECK R2 — slice R (confirm, scoped to the R1 fix diff)

Tier 1 (`/code-review high`, 10 tool uses; it confirmed each new test fails on the pre-fix code) and Tier 2 (Codex `gpt-5.6-sol`
xhigh: F2, F3, F5, F7 and L1 confirmed; F1 "not confirmed" because of item 2 below). Neither raised a CRITICAL or HIGH.

| # | Tier | Sev | Finding | Disposition |
|---|---|---|---|---|
| 1 | T1 | MED | A blank `fallbackModelId` (passes the parser) empties the lane candidates; `undefined === undefined` then selects `undefined`. | **Fixed:** both lane branches require `laneModelId !== undefined`. |
| 2 | T2 | MED | Role-fallback exhaustion throws before lane handling, so a verified lane model outside the role order is rejected when every role fallback failed. | **Deferred (routing follow-up):** this predates the slice. The throw at `origin/main:.pi/agent/extensions/harness-routing.ts:609` comes before lane handling at line 676. It needs a lane model outside the role's order plus every role fallback failed; no current lane has that shape. |
| 3 | T1 | MED | `recovery-policy` matched failed ids the old way, so for frontend + `["gpt-5.5"]` it recommended `openai-codex/gpt-5.5` while the resolver filtered it out. | **Fixed:** exported `failedModelMatcher` from `harness-routing.ts`, used by both modules. RED first: new `routing-failure-consistency.test.ts` (a separate file because `validate-harness-routing.sh` runs `harness-routing.test.ts` without `recovery-policy`). Mutation-verified. |
| 4 | T1 | LOW | The all-lane-failed path reported `source: "fallback"` even when the pick is the role's unfailed default. | **Fixed:** `"default"` when the pick is `fallbackOrder[0]`. |
| 5 | T1+T2 | LOW | Tests asserted only `selectedModelId` or `notEqual`; the F5 note check didn't discriminate; there was no direct test of the exhaustion throw. | **Fixed:** exact models plus `source`/`phaseRoutingSource`; the note must name no model; a new throw test (the mutation allowing the unverified target fails it). |
| 6 | T1 | LOW | The returned `failedModels` shows only the role-provider normalization, not cross-provider matches. | **Noted:** output metadata only; selection is correct. |
| 7 | T1 | LOW | The all-lane-failed path ignores allowed budget overrides before throwing. | **Noted:** contrived (unverified lane plus only the target left); throwing is the conservative choice. |
| 8 | T1 | LOW | "Requested override … kept X" can name a model a lane later replaces. | **Noted:** wording predates the slice; it fires only when an override is refused. |

Gates: routing tests 3× (71/71), `validate-harness-routing.sh` PASS, `validate-recovery-policy.sh` PASS, `npm run check` exit 0
(unit 720/720, integration 187/187, schema, static). Land: no CRITICAL/HIGH in R2, MEDIUMs fixed or deferred with evidence,
two-round cap respected.

## P2 — installs get pi's project config (`fix/harness-install-pi-project-config`)

**Problem (measured):** a fresh `harness-package.ts bootstrap` gave the target no `.pi/settings.json`, so pi's real loader
loaded **0** harness extensions there: no `safe-bash`, no `till-done`. The target got a root `SYSTEM.md`, which pi never reads,
but no `.pi/APPEND_SYSTEM.md`. Its `models.json` came from `models.template.json`, which had no `capabilities`, no
`phase_routing_profiles` and stale role models. Of the installed repo's own 697 shipped unit tests, 53 failed; 35 of those
came from the stale routing map.

**Change:**
- New manifest field `piSettingsTemplate` (`.pi/settings.json`), with `piSettingsKeys` limited to `extensions`, `skills`,
  `prompts` and `enableSkillCommands`. The source operator's provider and model defaults stay out, so the target user's
  global pi settings still apply.
- `mergePiSettings`:
  - fresh target: writes the file;
  - existing target: appends the harness entries to the resource lists, adds other keys only when missing, and warns on
    every preserved conflict;
  - keeps a non-list value (pi's legacy `skills` object) and warns.
- Entry rules:
  - pattern entries (`!`, `+`, `-`, globs) pass through;
  - absolute, `~` and target-escaping `../` entries are skipped;
  - entries the package doesn't ship are skipped (e.g. `../packages/pi-g-skills/skills`).
- `planPiSettings` runs before any write:
  - it rejects an array or invalid-JSON settings file and a symlinked `.pi` directory, so nothing is half-installed;
  - a symlinked settings file is left alone, with a warning and a next step.
- New generated file `.pi/APPEND_SYSTEM.md` (review). The root `SYSTEM.md` is still generated, per repo convention.
- `.pi/agent/models.json` is now generated from the live file. `models.template.json` is deleted, along with its allowlist
  entry.
- `piSettings` is recorded in `installed-package.json` and shown in the install output, which now also prints bootstrap
  warnings. `filesToReview` includes `.pi/settings.json`.
- `validate-harness-package.sh`: the runtime symlinks the repo's `node_modules` (pi's loader is needed), with no network
  install.

**Stop line:** Q0 fires because this decides whether the safety extensions load in installed repos. Claude implemented it;
nothing was delegated. Test → RED → implement → GREEN. Fix-batch behaviours were either RED-first or mutation-verified:
- malformed object accepted;
- symlinked settings not detected;
- patterns treated as paths;
- every template key shipped;
- settings never written;
- dropping the existence filter;
- overwriting existing values;
- removing the `APPEND_SYSTEM` rule.

Each mutation fails its named test.

**Measured after P2:** an installed repo loads all 55 harness extensions with 0 errors (pi's real loader, in the
integration test). The installed repo's own unit suite has 14 failures, down from 53; they are P3's scope (see below).

### QCHECK R1 — P2 (framings in parallel)

Tier 1 was `/code-review high`, with 10 findings. Tier 2 was Codex `gpt-5.6-sol` xhigh, with 50 lines and 3 HIGH. Tier 2
was mandatory (config/install surface; safety extensions).

| # | Tier | Sev | Finding | Disposition |
|---|---|---|---|---|
| 1 | T1+T2 | HIGH | An array or invalid-JSON target settings file was "merged" into nothing, or failed after assets and `package.json` were already written. | **Fixed:** preflight before any write; test checks rejection, nothing copied, file untouched. |
| 2 | T2 | HIGH | Existing `../`-escaping or absolute entries were appended, so pi could load code from outside the target. | **Fixed:** containment check, plus absolute/`~` skip. Fake-source test with a real file outside the target. |
| 3 | T2 | HIGH | A symlinked `.pi` (e.g. → `~/.pi`) was written through. | **Fixed:** install refuses before any write; test checks the external dir stays empty and no `package.json` is written. |
| 4 | T1 | HIGH | The source's provider/model defaults overrode the target user's global settings. | **Fixed:** `piSettingsKeys`; test asserts `defaultProvider`/`defaultModel`/`enabledModels` are absent. `afk-worker-execution-plan.ts` falls back to pi's defaults when they are absent. |
| 5 | T1+T2 | MED | A non-list resource value was replaced silently, destroying pi's legacy `skills` object. | **Fixed:** kept, with a warning; test. |
| 6 | T1+T2 | MED | Pattern entries were treated as paths and dropped. | **Fixed:** pass through; fake-source test. |
| 7 | T1 | MED | Tests used the source's live settings as the oracle, which fails inside an installed repo with its own entries. | **Fixed:** oracle = shipped source entries. |
| 8 | T1 | MED | A symlinked `.pi/settings.json` (shared dotfile) would be rewritten. | **Fixed:** skipped, with a warning and a next step; test checks the shared file is unchanged. |
| 9 | T1 | MED | The validator npm-installed the pi trees on every run and ignored install failure. | **Fixed:** symlink the repo's `node_modules`; fails clearly if pi is missing. |
| 10 | T1+T2 | MED/LOW | Install text output hid `piSettings` and warnings; the version record lacked `piSettings`; the bin and CLI JSON tests covered the old contract; docs were stale. | **Fixed:** all four (bin assertion mutation-verified). |
| 11 | T1 | MED | The `../packages/pi-g-skills/skills` skills entry is never shipped, so installed repos lack the g-* skills the docs mention. | **Deferred (packaging follow-up):** predates P2 (`packages/` was never a reusable asset). The warning says so. |

### QCHECK R2 — P2 (confirm, scoped to the R1 fix diff)

Tier 1 (`/code-review high`) raised no new CRITICAL or HIGH. Its findings:

| # | Sev | Finding | Disposition |
|---|---|---|---|
| 1 | MED | With a legacy `skills` object, the template's top-level `enableSkillCommands` was added and overrode the legacy value (pi migrates it only while the top-level key is absent). | **Fixed:** the top-level key is skipped when `skills.enableSkillCommands` exists; the test now uses `false`. RED first. |
| 2 | MED | Pattern entries skipped the absolute, `~` and containment checks (`+/abs/…`, `!../../…/**`). | **Fixed:** the path part (prefix stripped) gets the same checks; only the existence check is skipped. RED first. |
| 3 | MED | A dangling `.pi` symlink slipped past the guard (`pathExists` follows links). | **Fixed:** `lstat` directly. RED first. |
| 4 | MED | Symlinked children (`.pi/agent`, …) are written through. | **Deferred (packaging follow-up):** `copyAsset` wrote through any symlinked component before P2. P2 guards the two paths it introduced (`.pi`, `.pi/settings.json`). |
| 5 | MED | Required `piSettingsKeys`/`piSettingsTemplate` broke manifests from older installs. | **Fixed:** both optional. A missing template means settings are skipped with a warning; missing keys fall back to the default list. RED first. |
| 6 | MED | The validator's `exit 1` before writing its report left a header-only `.md` and no JSON; only pi was checked. | **Fixed:** missing `typescript`, `tsx` or `pi` fails checks 1–2 with the message, and the report and JSON are still written. Syntax-checked; the missing-dependency path was not exercised, because that would mean removing `node_modules`. |
| 7 | MED | The extension oracle was nearly circular (exists-in-dest on both sides). | **Fixed:** the oracle is every source entry under `agent/extensions/`, and each must exist in the target. |
| 8 | LOW | `.pi` as a file gave a raw ENOTDIR; a settings directory was reported as invalid JSON. | **Fixed:** clear errors. RED first. |
| 9 | LOW | The render assertion depended on a repo-specific skills entry; the pattern test left files in the shared tmpdir. | **Fixed:** a deterministic conflict warning, and one temp parent. The 7 leftover files from earlier runs were deleted. |
| 10 | LOW | The `node_modules` symlink could be committed; a stale comment. | **Fixed/guarded:** staging excludes it; comment updated. |

Gates: focused tests 3× (18/18), `validate-harness-package.sh` PASS, `npm run check` exit 0 (unit 720/720, integration 196/196).

Tier 2 (Codex `gpt-5.6-sol` xhigh, R2 confirm): no CRITICAL. It confirmed eight of ten fixes.

| # | Sev | Finding | Disposition |
|---|---|---|---|
| C1 | HIGH | Symlinked descendants (`.pi/agent -> /external`) are followed while copying assets, so the install writes outside the target. | **Split to slice P2b**, per the g2-qcheck rule that a CRITICAL/HIGH surfacing in R2 means split, not a third round. It predates P2: `copyAsset` and `copyFileIfAbsent` follow links on `main`, and P2 only adds the top-level `.pi` guard. Same item as T1 #4. P2b runs next, with its own R1/R2. |
| C2 | MED | A manifest without `piSettingsTemplate` still validated the target settings, so invalid JSON aborted an install that was supposed to leave the file alone. | **Fixed:** the template check now comes before any settings validation. Test with an old-manifest fixture and malformed settings: install succeeds and the file is byte-identical. RED first. |
| C3 | MED | On POSIX, Windows drive and UNC paths were not machine-specific, so a `C:\…\*.ts` glob was copied. | **Fixed:** `isMachineSpecificPath`. Test entries added. RED first. |
| C4 | LOW | Every "skipped" status produced the symlink next step, even for the old-manifest case. | **Fixed:** the bootstrap result carries `piSettingsSkipReason`, and that reason becomes the next step. Tested. |

Gates after: focused tests 3× (19/19), `validate-harness-package.sh` PASS, `npm run check` exit 0. P2 lands with the
descendant-symlink HIGH split out to P2b.
