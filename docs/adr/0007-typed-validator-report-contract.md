# ADR-0007: Validator reports go through one typed TypeScript contract

- **Status:** Accepted
- **Date:** 2026-05-28
- **Supersedes:** none
- **Superseded-By:** none

## Context

The harness has 45 `scripts/validate-*.sh` scripts plus 3 `.mjs`
counterparts (10,136 LOC total). The 21 "heavy" ones (≥100 LOC each)
emit two artifacts per run:

- A Markdown report at `reports/validation/<date>_<slug>-validation-script.md`.
- A JSON summary at `reports/validation/<date>_<slug>-validation-script.json`
  with the shape `{ status, failedChecks, checks: [{ name, status, detail }] }`.

Both artifacts feed concrete downstream consumers:

- `scripts/collect-harness-tuning-data.sh:152-165` reads `status`
  and `failedChecks` to roll up harness-tuning telemetry.
- `scripts/harness-integrate.ts:111-123` invokes validators with
  `--report <md-path> --summary-json <json-path>` and threads the
  result paths into `IntegrateWorktreeResult.postMergeValidation`.

The JSON shape is identical across all 19+ emitters, but it was
**hand-rolled** in each script — typically by shelling out to inline
Python that built a dict and dumped it via `json.dump(..., indent=2)`.
Every emitter independently decided field order, indent, trailing
newline, empty-array formatting, and (in subtle cases) what counts
as a `FAIL` vs `WARN` vs `SKIP`. Reviewers and tooling have, more
than once, depended on a property no producer actually guaranteed.

The 2026-05-26 architectural review (Tier 3 §10, PR #221 scope-check)
captured the cost and called the right shape:

> Future work should split this into an explicit validator-architecture
> project: **first define a shared TS report/summary contract module
> to capture the `{status, failedChecks, checks}` shape currently
> embedded in 19+ bash files**, then migrate one low-risk heavy
> validator at a time behind compatibility aliases. Do not replace
> only the trivial wrappers in this initiative — that would add a
> second validator style without retiring the load-bearing one.

ADR-0005 then explicitly designated this contract as the
follow-up to the typed control-plane kernel ("Designates
validator-report schema… as opportunistic follow-up"). ADR-0006
established the migration framework + typed row ops, which gives
typed harness state and FK-backed cross-entity constraints to
build the next layer on. This ADR adds the validator-report
contract that step 7 needs as its foundation, and ships the first
proof-of-life producer migration.

## Decision

There is exactly one typed contract for validator reports.
Producers write through it; consumers read structured data that has
already been schema-validated. Three concrete pieces:

### 1. Typed contract module

[`.pi/agent/extensions/lib/validator-report.ts`](../../.pi/agent/extensions/lib/validator-report.ts)
exports:

- `ValidatorCheckStatus = "PASS" | "FAIL" | "SKIP" | "WARN"` and
  `ValidatorReportStatus = "PASS" | "FAIL" | "WARN"` discriminated
  enums. `SKIP` is a per-check signal only — it does NOT raise the
  top-level status (a report with all SKIPs is `PASS`). The
  rationale matches the existing emitters: SKIP is "this check
  was deliberately not run" (e.g., a live-probe behind a flag),
  not a problem.
- `ValidatorCheck { name, status, detail }` and
  `ValidatorReport { status, failedChecks, checks }` interfaces
  with `readonly` fields; the JSON shape is fully captured here.
- `createValidatorReportBuilder()` — imperative API for producers
  that push checks in order; `.build()` derives `status` and
  `failedChecks` so they cannot drift from the checks array.
- `parseValidatorReport(raw)` — schema validator that throws
  `ValidatorReportError` on any deviation, including cross-field
  drift (top-level `status` disagreeing with derived status,
  `failedChecks` disagreeing with FAIL count). Consumers use it
  to short-circuit malformed producer output.
- `validatorReportToCanonicalJson(report)` — single sanctioned
  serializer. Locked to the byte-equivalent shape of the existing
  Python emission (key order `{status, failedChecks, checks}`,
  check-key order `{name, status, detail}`, two-space indent,
  trailing newline). A golden-file test asserts byte equality
  against a real existing report.

### 2. CLI emitter for bash producers

[`scripts/lib/emit-validator-report.ts`](../../scripts/lib/emit-validator-report.ts)
is a small CLI that bash validators shell out to. It accepts two
input modes:

- **JSON-input mode** — for TS or modern producers:
  `--out <json> [--input <checks.json>]` reads
  `{ checks: [{name, status, detail}] }` (from `--input` file or
  stdin), validates via `parseValidatorReport`, and writes
  canonical JSON.
- **Parallel-files mode** — for bash producers that already
  accumulate `CHECK_NAMES` / `CHECK_STATUS` / `CHECK_DETAILS`
  arrays: `--out <json> --names-file <path> --statuses-file <path>
  --details-file <path>` reads three newline-delimited files and
  zips them into checks. This is the path the proof-of-life
  migration uses (next subsection).

Exit codes are typed: `0` success, `2` contract violation
(invalid status, drift, mismatched parallel-file lengths), `1`
other I/O failure. Bash producers can `set -euo pipefail` and let
the typed exit code surface contract bugs as validator failures
rather than silently malformed JSON.

### 3. Proof-of-life producer migration

`scripts/validate-harness-package.sh` is the first bash validator
to emit through the typed contract. Its `write_json_summary`
function used to shell out to inline Python that built a dict and
dumped JSON; that block is now replaced by:

```bash
"$NODE_BIN" --import "$TSX_IMPORT" \
  "$REPO_ROOT/scripts/lib/emit-validator-report.ts" \
  --out "$SUMMARY_JSON_PATH" \
  --names-file "$names_file" \
  --statuses-file "$statuses_file" \
  --details-file "$details_file"
```

End-to-end byte-equivalence with the pre-migration emission was
confirmed by `diff`-ing the JSON output against an existing
2026-05-27 report on disk: zero differences. Consumers
(`collect-harness-tuning-data.sh`, `harness-integrate.ts`)
require no changes.

### What this decision explicitly does NOT cover

- **Migrating every existing bash validator.** This PR migrates
  exactly one validator (`validate-harness-package.sh`). The
  scope-check from Tier 3 §10 was emphatic: "Do not replace only
  the trivial wrappers in this initiative — that would add a
  second validator style without retiring the load-bearing one."
  Each subsequent migration is its own focused PR, low-risk
  heavy validators first.
- **Rewriting bash validators in TypeScript.** The contract lets
  bash producers keep their existing structure (temp-runtime
  setup, npm install in scratch dirs, per-check tracking) and
  swap only the JSON emission. A future PR may rewrite a
  validator end-to-end in TS, but that decision is per-validator
  and not pre-decided here.
- **The Markdown report shape.** Today each bash validator
  renders its own Markdown table inline. A typed Markdown emitter
  is a natural follow-up but not in scope; the JSON contract is
  what downstream tooling consumes, so it goes first.
- **Schema versioning for the report.** The contract is at v1.
  If a future change widens `ValidatorCheckStatus` (e.g., adding
  `"INFO"`), consumers will need a coordinated bump. Today there
  is one consumer pair, both in-repo; introducing an explicit
  version field is premature.
- **Auto-discovery wiring for new validator tests.**
  `scripts/validate-extension-unit-tests.sh` has a hardcoded
  check list and does not auto-discover the new
  `validator-report.test.ts` (same gap noted for
  `doctor.test.ts`, `harness-package.test.ts`,
  `coordinated-state.test.ts`, `control-plane.test.ts`,
  `runtime-migrations.test.ts`). Validator-wiring is a separate
  PR.

## Consequences

Positive:

- Every new validator report is schema-validated at write time.
  Producer bugs (wrong `status` value, drift between top-level
  fields and the checks array) surface as `exit 2` instead of
  silently malformed JSON that downstream tools blame on the
  consumer.
- The byte-equivalent canonical serializer means producers can be
  migrated one at a time without coordinating with consumers. A
  follow-up PR can swap an arbitrary validator over and `diff`
  the JSON to prove zero behavior change.
- The typed builder API derives `status` and `failedChecks` from
  the checks list. Whichever follow-up PR migrates the most-error-
  prone heavy validator gets that bookkeeping for free.
- TypeScript producers (future per-validator migrations or new
  validators built on the kernel from ADR-0005) get type-safe
  enums on the way in, not a stringly-typed payload.

Negative:

- Two validator styles coexist for now. Until every bash
  validator migrates, contributors must learn both shapes (the
  inline Python emission and the typed-contract emission).
  Migrating in small focused PRs is the right pace, but the
  transition window is real.
- The CLI emitter is a per-invocation `node --import tsx` spawn.
  For validators that emit one report per run, the spawn cost is
  trivial. If a future validator wants to emit many reports per
  invocation, batching or a long-lived emitter is a follow-up.
- The byte-equivalence guarantee constrains future evolution: any
  change to the canonical serializer (e.g., different indent,
  reordered keys) is a coordinated cutover across all migrated
  producers + consumers. The golden-file test enforces this
  intentionally — silent shape drift is the bug we're closing.

## Notes

- Typed contract:
  [`.pi/agent/extensions/lib/validator-report.ts`](../../.pi/agent/extensions/lib/validator-report.ts).
- CLI emitter:
  [`scripts/lib/emit-validator-report.ts`](../../scripts/lib/emit-validator-report.ts).
- First migrated producer:
  [`scripts/validate-harness-package.sh`](../../scripts/validate-harness-package.sh)
  (the `write_json_summary` function).
- Tests: `tests/extension-units/validator-report.test.ts` (19
  tests covering status derivation, FAIL counting, builder
  flow, all parser rejection paths, golden-file byte-equivalence
  against a real harness-package report, and the CLI emitter's
  JSON-input / parallel-files / contract-violation / missing-flag
  paths).
- Related:
  [ADR-0005](./0005-typed-control-plane-kernel.md) (kernel; the
  validator-report contract is the follow-up the kernel ADR
  explicitly designated),
  [ADR-0006](./0006-sqlite-as-real-domain-store.md) (domain store;
  validators write status into SQLite-backed tuning data via the
  consumers above, so a stable typed shape matters for typed
  row-op work downstream).
