# ADR-0009: Validator live-probe flag convention — `--skip-live` is always accepted, semantics depend on the validator's default

- **Status:** Accepted
- **Date:** 2026-05-28
- **Supersedes:** none
- **Superseded-By:** none

## Context

Three repo validators interact with live providers in different ways:

- **`scripts/validate-prompt-semantics-live.sh`** (PR #242) — primary
  purpose IS the live semantic proof. Default is LIVE ON. Accepts
  `--skip-live` to opt out (CI, tuning runs, any context where
  touching a live provider is undesirable).
- **`scripts/validate-queue-runner.sh`** — has both local-only and
  live-probe checks. Default is LIVE ON. Accepts `--skip-live` to
  opt out.
- **`scripts/validate-harness-routing.sh`** — has both local-only
  and live-probe checks. Default is LIVE OFF. Accepts `--include-live`
  to opt in.

The asymmetry of defaults is intentional: a validator named `*-live.sh`
exists to perform live work; one named `validate-X.sh` exists to
validate X, with an optional live wiring proof. The flag-name asymmetry
(`--skip-live` vs `--include-live`) follows the default: opt-out for
live-by-default validators, opt-in for local-by-default ones.

PR #246's QCHECK flagged this as confusing for operators. A CI script
that wants to "skip the live probe in every validator" has to know
which flag each accepts. Some accept `--skip-live` (no-op in
`harness-routing`); some accept `--include-live` (unsupported in
`prompt-semantics-live`). Operators currently learn the per-validator
convention by reading each script's `--help`.

## Decision

The flag-name asymmetry stays — flipping defaults would be a real
behavior change with operational consequences (CI scripts that currently
get LIVE results from `prompt-semantics-live.sh` would silently switch
to LOCAL). But every live-probing validator MUST accept `--skip-live`
as an explicit "skip the live probe" instruction:

1. **Validators whose primary purpose is the live probe (`*-live.sh`)**
   - Default: LIVE ON.
   - `--skip-live`: opt out. Records `status: SKIP` for the live
     check(s) with a distinct detail string naming the flag
     (`Live probe skipped by --skip-live flag (caller opted out of
     provider-backed validation).`) so consumers can tell from the
     JSON exactly why the probe did not run.
   - `--include-live`: NOT accepted. Live is already on by default;
     the flag would be redundant.

2. **Validators with optional live probes (other `validate-*.sh`)**
   - Default: LIVE OFF.
   - `--include-live`: opt in. Live check(s) run.
   - `--skip-live`: ACCEPTED AS A NO-OP. Documented in the
     validator's `--help` text as "no-op alias for the default
     behavior; accepted for operator-uniform usage so CI scripts
     can pass `--skip-live` to every validator regardless of
     default."

The convention ensures a CI script that wants no live work
**anywhere** can confidently pass `--skip-live` to every live-probing
validator and get the expected behavior, even when the validator
defaults to LIVE OFF.

### What this decision explicitly does NOT cover

- **Flipping `prompt-semantics-live.sh` to LIVE OFF by default** — a
  validator with `-live` in its name should default LIVE ON. Changing
  the default would surprise existing callers and contradict the
  script's name. The flag is the documented opt-out path; the default
  stays.
- **Removing `--include-live`** from validators that have it. The
  flag's positive-sense name reads better in those contexts ("include
  live probe") than the negative `--skip-live`. Both are accepted
  going forward.
- **A `--with-live` / `--without-live` / `--live=on|off` family of
  flags.** ADR-0002 (bounded autonomy) prefers explicit binary flags
  over option-value combinations for live work, and the existing two
  flags cover both opt-in and opt-out cases. Adding more flag names
  would be confusion without clarity gain.
- **Standardising on a single SKIP detail string across all
  validators.** Each validator's SKIP detail is descriptive of its
  specific gate (e.g., `Live probe skipped because the configured Pi
  binary was not available in PATH.` vs `Live probe deferred; pass
  --include-live for one bounded live wiring proof.`). The
  ADR-0007 contract doesn't require uniform wording — consumers
  match on the structured `status` field, not the freeform `detail`.

## Consequences

Positive:

- A CI script that wants no live work can pass `--skip-live` to every
  live-probing validator and rely on the predictable outcome (live
  off, whether by default or by flag).
- The flag convention is documentable in one place (this ADR) instead
  of operator manuals reciting it per validator.
- No breaking changes to existing callers. Validators that previously
  accepted only one flag continue to accept it; the new no-op alias
  is purely additive.

Negative:

- Two flag names for the same operator intent ("don't run the live
  probe") coexist. New contributors must learn that `--skip-live`
  works everywhere but `--include-live` only on the opt-in subset.
- The no-op alias in `--skip-live`-as-default-off validators is
  semantically vacuous and could look like a typo in script logs.
  The `--help` text documents the alias to mitigate confusion.
- The SKIP detail strings still differ across validators (by design
  — each describes its specific gate). Operators reading the JSON
  who want to know "why did this validator skip?" must still parse
  the freeform detail.

## Notes

- Flag-accepting validators after this ADR:
  - [`scripts/validate-prompt-semantics-live.sh`](../../scripts/validate-prompt-semantics-live.sh)
    — `--skip-live` opt-out, default LIVE ON.
  - [`scripts/validate-queue-runner.sh`](../../scripts/validate-queue-runner.sh)
    — `--skip-live` opt-out, default LIVE ON.
  - [`scripts/validate-harness-routing.sh`](../../scripts/validate-harness-routing.sh)
    — `--include-live` opt-in, default LIVE OFF; also accepts
    `--skip-live` as a documented no-op alias per this ADR.
- Operator docs updated by PR #246:
  [operator_workflow.md](../../.pi/agent/docs/operator_workflow.md),
  [validation_architecture.md](../../.pi/agent/docs/validation_architecture.md).
- Related: [ADR-0002](./0002-bounded-autonomy.md) (bounded autonomy
  rule that live probes must be explicit at the call site, never
  background or hidden).
