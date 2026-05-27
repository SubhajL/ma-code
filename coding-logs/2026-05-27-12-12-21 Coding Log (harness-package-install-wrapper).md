# Coding Log — harness-package install wrapper

## Goal

Collapse the multi-step "deploy harness into another repo" flow into a single
`install` subcommand on `scripts/harness-package.ts` that wraps `bootstrap` +
`npm install --no-package-lock` + three cheap validators
(`validate:harness-package`, `validate:core-workflows`,
`validate:harness-routing`), probes provider env vars, and emits a structured
files-to-review list. Add npm script aliases (`harness:install` /
`harness:install:json`) in both root `package.json` and the bootstrapped
`package.template.json`. Update install docs to lead with the new command.

## Approach

Extended the existing helper rather than adding a new script, matching the
codebase preference for small focused changes and the bounded ethos. New
exports: `installHarnessPackage`, `renderHarnessPackageInstall`,
`HARNESS_INSTALL_VALIDATORS`, plus result/option/sub-result types.

TDD cycle:
- RED: added 3 integration tests in `tests/integration/harness-package.test.ts`
  (function shape, CLI JSON output, `--dest` validation). All failed on missing
  exports.
- GREEN: implemented `installHarnessPackage` + `renderHarnessPackageInstall`
  + new CLI subcommand. All tests passed.
- QCHECK (via `/code-review`): surfaced six recall-mode findings; addressed
  the high-severity ones in a follow-up pass.

## QCHECK fixes applied

1. **Skip-reason conflation** — validators previously got a synthetic stderrTail
   "Skipped because npm install did not complete successfully" regardless of
   whether the user requested the skip, npm install was user-skipped, or npm
   install actually failed. Replaced with a typed `skipReason` discriminator
   on both `NpmInstallStepResult` (`user_request`) and `ValidatorStepResult`
   (`user_request | upstream_skipped | upstream_failed`). `stderrTail` now
   reserved for real captured stderr only.
2. **`requireValue` accepted flag-like next-token** — `--dest --skip-install`
   silently treated `--skip-install` as the destination path. Added explicit
   `startsWith("-")` rejection with a new test that asserts the helpful error.
3. **Defensive env merge** — `options.env ?? process.env` would strip PATH if
   a programmatic caller passed a partial env. Switched to
   `options.env ? { ...process.env, ...options.env } : process.env`.
4. **`collectFilesToReview` dedupe** — added `new Set()` wrap before `.sort()`
   to be robust if generated/preserved sets ever overlap.
5. **Test env restoration** — moved env capture/mutation inside the try block
   so the finally still restores values if any future setup throws.

## Out-of-scope items intentionally NOT addressed

- Cross-doc references in `operator_manual.md`, `operator_workflow.md`, and
  `operator_quickstart.md` — these were not in the original task scope
  (per the user's prompt: "Update `.pi/agent/docs/harness_package_install.md`
  and `operator_install_guide.md` to lead with the new single command"). Per
  AGENTS.md "Do not widen scope silently." Tracking for a follow-up if the
  install wrapper becomes the canonical entry.
- Windows compatibility (spawn npm.cmd) — codebase is POSIX-only (all
  validators are bash scripts).
- Recursive bootstrap from a derived clone — possible by design (target gets
  the full `scripts/` + manifest after bootstrap) and not a regression
  introduced here.

## Files changed

- `scripts/harness-package.ts` — added `install` subcommand, new exported
  types/functions, CLI wiring, `requireValue` flag-like guard.
- `tests/integration/harness-package.test.ts` — three new integration tests
  (function shape, CLI JSON, missing `--dest`) plus a fourth for the flag-like
  value guard.
- `package.json` — added `harness:install` and `harness:install:json` script
  aliases.
- `.pi/agent/package/templates/package.template.json` — same aliases so
  bootstrapped targets carry the wrapper.
- `.pi/agent/docs/harness_package_install.md` — leads with the new one-shot
  command; manual flow preserved below as a fallback.
- `.pi/agent/docs/operator_install_guide.md` — promoted the new path to
  "Option A" (preferred), renamed the legacy local-operate path to "Option C"
  to avoid a duplicate "Option B" heading.
- `scripts/validate-harness-package.sh` — `check_3` now asserts
  `harness:install` is wired in both `package.json` and the template, and that
  both install docs mention it.

## Evidence

- `npm run typecheck` → clean (baseline `.typecheck-baseline-count` = 0).
- `npm run test:harness-package` → 6 tests pass, 3 consecutive runs.
- `npm run validate:harness-package` → PASS (all three checks green: compile,
  integration, manifest/doc-wiring).
- `npm run validate:harness-routing` → PASS.
- `npm run validate:core-workflows` → FAIL on `operator-leases` and
  `queue-session` checks. Confirmed pre-existing on a clean tree
  (`git stash && npm run validate:core-workflows` → same 2 failures). Not a
  regression introduced by this work.

## Wiring verification

| New export | Non-test import | File:Line |
|---|---|---|
| `installHarnessPackage` | YES | `scripts/harness-package.ts` (CLI `install` branch) |
| `renderHarnessPackageInstall` | YES | `scripts/harness-package.ts` (CLI `install` branch) |
| `HARNESS_INSTALL_VALIDATORS` | YES | `scripts/harness-package.ts` (impl loop) |
| `HarnessPackageInstallOptions` / `HarnessPackageInstallResult` | YES | `scripts/harness-package.ts` (function signatures) |
| `NpmInstallStepResult` / `ValidatorStepResult` / `ProviderEnvProbe` | YES | result-type fields |
| `NpmInstallSkipReason` / `ValidatorSkipReason` | YES | discriminator fields on the above |

## Unresolved risks / known gaps

- The `harness:install` wrapper still gates validators on `npm install`
  having `status === "passed"`. If a user passes `--skip-install` because the
  target already has `node_modules`, validators are auto-skipped with
  `skipReason: "upstream_skipped"`. A future `--assume-installed` flag could
  bypass this, but it's not in scope here.
- Bootstrap that throws partway leaves the destination in a partial state
  with no structured rollback artifact. Existing behavior preserved.
- `validate:harness-package` is one of the three default validators but it
  itself spawns a nested `npm install` in a temp runtime — it is not strictly
  "cheap." Docs describe the three as "cheap validators" which is mostly
  accurate but slightly aspirational for that one validator. Worth a separate
  follow-up to either swap it out or rephrase the docs.
