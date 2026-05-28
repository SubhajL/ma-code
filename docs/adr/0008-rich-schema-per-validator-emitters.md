# ADR-0008: Validators with output shapes incompatible with the generic contract get their own typed emitter

- **Status:** Accepted
- **Date:** 2026-05-28
- **Supersedes:** none
- **Superseded-By:** none

## Context

[ADR-0007](./0007-typed-validator-report-contract.md) introduced the
generic `{status, failedChecks, checks}` validator-report shape and
the `scripts/lib/emit-validator-report.ts` CLI emitter. 16 of the
repo's 17 JSON-emitting bash validators now write through that
generic emitter (PRs #229, #230–#241, #242, #244, #245).

`scripts/validate-product-pipeline-e2e.sh` is structurally different.
It emits a rich custom schema:

```jsonc
{
  "version": 1,
  "initiativeId": "checkout-mini",
  "status": "pass" | "fail",         // lowercase, not the ADR-0007 PASS/FAIL/WARN enum
  "boundedFullAutoReadiness": "ready" | "blocked",
  "phases": [{ "phase", "status", "artifacts", "evidence", "blockers", "nextActions" }],
  "hitlGatesProven": string[],
  "blockedPathsProven": string[],
  "blockedPathDetails": [{ "id", "phase", "status", "nextAction", "blockers" }],
  "idempotency": { "status", "evidence" },
  "observability": { "reportsWritten", "logsReferenced", "missingEvidence" },
  "goNoGo": { "decision", "reasons" },
  "safety": { "liveProviderCalls", "liveStitchCalls", "trackedRuntimeJsonFiles", "productImplementationOutputs", "daemonOrWatchModeIntroduced" }
}
```

`tests/integration/product-pipeline-e2e.test.ts` reads specific
fields of this shape (phase IDs, HITL gate names, goNoGo decision,
etc.). The byte shape is load-bearing for that consumer. The shape
cannot be reduced to `{status, failedChecks, checks}` without losing
information the consumer requires.

PR #243 migrated this validator by introducing a new sibling typed
emitter (`scripts/lib/emit-product-pipeline-e2e-report.ts`) and its
own parser/serializer. That established a pattern; this ADR records
the pattern so future "rich shape" validators have an obvious place
to point to instead of re-debating the question per-PR.

## Decision

**Decision rule.** Use the generic emitter
([ADR-0007](./0007-typed-validator-report-contract.md),
`scripts/lib/emit-validator-report.ts`) when the validator's output
JSON satisfies ALL of:

- top-level `status` is `"PASS" | "FAIL" | "WARN"` (uppercase enum);
- top-level `failedChecks` is a non-negative integer; AND
- top-level `checks` is an array of `{name: string, status: ...,
  detail: string}` and there are no other top-level fields beyond
  `status` / `failedChecks` / `checks`.

Otherwise the validator gets its own sibling typed emitter
following the template below. The first such validator was
`validate-product-pipeline-e2e.sh` (PR #243); when in doubt, read
`scripts/lib/emit-product-pipeline-e2e-report.ts` for the
canonical sibling-emitter shape.

When a validator's report shape is incompatible with the generic
`{status, failedChecks, checks}` contract from ADR-0007, the
validator gets its own typed emitter following the same structural
template as `scripts/lib/emit-validator-report.ts`:

1. **Module location:** `scripts/lib/emit-<validator-slug>-report.ts`.
2. **Exports:**
   - A typed schema (interfaces / type aliases) capturing the
     validator's full JSON shape with `readonly` fields.
   - A parser function `parse<ValidatorSlug>Report(raw: unknown)`
     that validates the shape against the typed contract and throws
     a custom `<ValidatorSlug>ReportError` on any deviation.
   - A canonical serializer
     `<validatorSlug>ReportToCanonicalJson(report)` that reproduces
     the prior inline-Python `json.dump(..., indent=2)` output
     byte-for-byte: matching key order, two-space indent, trailing
     newline.
   - A CLI entry point with `--input <intermediate.json> --out
     <canonical.json>` arguments and typed exit codes
     (`0`=success, `2`=contract violation, `1`=other I/O).
3. **Producer integration:** the bash validator writes its summary
   dict to an intermediate JSON path via Python (or whatever its
   existing pipeline uses), then bash glue invokes the TS emitter to
   validate the shape and write the final canonical JSON.
4. **Verification:** a unit test under `tests/extension-units/`
   covers parse success, every schema-rejection path, byte-stable
   serialization (round-trip stability), and CLI exit codes. The
   migration PR also runs the validator end-to-end and verifies
   `diff` between pre- and post-migration JSON is empty (after
   normalizing any non-deterministic embedded paths like mktemp
   directories).
5. **No generic framework:** the two emitter modules
   (`emit-validator-report.ts` and
   `emit-product-pipeline-e2e-report.ts`) intentionally do not share
   a base class or factory. Each schema is small enough that a
   framework would add more abstraction overhead than it saves. If a
   third or more rich-schema validator appears, that becomes a
   reasonable point to revisit and extract shared helpers
   (`runEmitterChild`, `canonicalJson<T>`, `takeValue`,
   `isRecord`) — but premature with only two instances.

### What this decision explicitly does NOT cover

- **Forcing the generic contract on validators with rich shapes.**
  Validators that emit a strict superset of
  `{status, failedChecks, checks}` (which today is none — every
  in-repo "shape-mismatch" validator emits a fundamentally
  different schema) are NOT covered by this ADR. If such a case
  arises, the right call is probably ADR-0007's contract with an
  extension field rather than a sibling emitter.
- **A registry of all rich-schema emitters.** Discovery is by
  filesystem convention (`scripts/lib/emit-*-report.ts`) plus the
  ADR cross-link. No JSON manifest, no codegen.
- **Schema versioning.** Each rich-schema emitter declares
  `version: 1` in its typed shape; widening the schema requires a
  coordinated cutover with consumers, same as the generic contract.
  No automatic version negotiation.

## Consequences

Positive:

- New rich-schema validators have an obvious template to follow.
  PR #243 demonstrated the template; this ADR makes the choice
  citeable instead of "go look at PR #243".
- Each rich-schema emitter is independently versioned and
  byte-stable. Schema bugs surface as exit code 2 from the emitter,
  not silently malformed JSON.
- The decision not to extract a framework keeps the abstraction
  cost honest. With only two instances, sharing helpers would force
  decisions about generics, error-class hierarchy, and CLI layout
  that aren't load-bearing yet.

Negative:

- Two parallel CLI emitter modules exist and duplicate small
  helpers (`takeValue`, `isRecord`, canonical-JSON formatting, CLI
  bootstrapping). Until a third instance arrives, that duplication
  has to be tolerated.
- New emitter author must learn the template by reading both
  existing emitters and this ADR; there's no shared scaffold or
  generator to start from.
- The "rich schema" / "generic contract" distinction is per-validator
  judgment, not enforced by tooling. A future contributor could
  introduce a rich-schema emitter without noticing the generic
  emitter would have worked.

## Notes

- Generic-contract emitter (ADR-0007):
  [`.pi/agent/extensions/lib/validator-report.ts`](../../.pi/agent/extensions/lib/validator-report.ts) +
  [`scripts/lib/emit-validator-report.ts`](../../scripts/lib/emit-validator-report.ts).
- First rich-schema sibling (PR #243):
  [`scripts/lib/emit-product-pipeline-e2e-report.ts`](../../scripts/lib/emit-product-pipeline-e2e-report.ts)
  with tests at
  `tests/extension-units/product-pipeline-e2e-report.test.ts`.
- Migration evidence: PR #243's diff and the byte-equivalence
  verification recorded in its commit body.
- Designated future work: extract shared helpers
  (`runEmitterChild`, `canonicalJson<T>`, `takeValue`, `isRecord`,
  CLI `runEmitter` boilerplate) if and when a third rich-schema
  emitter is needed.
- Related: [ADR-0007](./0007-typed-validator-report-contract.md)
  (the generic contract this ADR is a sibling of),
  [ADR-0005](./0005-typed-control-plane-kernel.md) (the kernel
  precedent for "typed contracts at the producer boundary").
