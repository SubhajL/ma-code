# Screen Artifact Approval

Phase 5 adds durable human approval sidecars for Phase 4 mock screen artifacts before FE implementation can proceed.

## Purpose

- Require human product/design review of generated mock screen artifacts.
- Bind approval to the exact mock artifact hash so changed artifacts cannot silently reuse old approval.
- Preserve rejected screen decisions as reviewable product evidence.
- Provide a stable proof source for later FE packet generation without creating packets in Phase 5.

## Runtime boundary

This surface is approval-only:

- It reads `docs/initiatives/<slug>/screen-artifacts/<slice-id>.mock-screen.json` by default, or a reviewed live summary at `docs/initiatives/<slug>/screen-artifacts/<slice-id>.live-screen.json` when later phases explicitly select live artifact review.
- It validates the artifact belongs to the requested initiative and slice.
- It distinguishes artifact mode: `mock` or `live`; live summaries still require human approval before downstream implementation.
- It validates the artifact records no task packet or queue job creation.
- `status` is read-only and writes no files.
- `approve` and `reject` write only `docs/initiatives/<slug>/screen-artifacts/<slice-id>.approval.json`; Phase 5 writes only `docs/initiatives/<slug>/screen-artifacts/<slice-id>.approval.json`.
- It does not call Stitch.
- It does not create task packets.
- It does not create queue jobs.
- It does not dispatch workers.
- It does not implement frontend or backend code.
- It does not write `.pi/agent/state/runtime/*.json`.

## CLI

Read status without writing files:

```bash
npm run harness:screen-approval -- status --initiative <slug> --slice <slice-id>
```

Approve a reviewed mock screen artifact:

```bash
npm run harness:screen-approval -- approve --initiative <slug> --slice <slice-id> --by <reviewer> --note "Looks aligned with product intent."
```

Reject a mock screen artifact with a required reason:

```bash
npm run harness:screen-approval -- reject --initiative <slug> --slice <slice-id> --by <reviewer> --reason "Pricing state is missing error copy."
```

Use `--json` with any command for machine-readable output.

Re-approval after a previous rejection or replacement of an existing decision requires explicit operator intent:

```bash
npm run harness:screen-approval -- approve --initiative <slug> --slice <slice-id> --by <reviewer> --note "Updated artifact is approved." --reapprove
```

## Approval artifact

Approval sidecar path:

- `docs/initiatives/<slug>/screen-artifacts/<slice-id>.approval.json`

Approved sidecars record:

- `version: 1`
- `initiativeId` and `sliceId`
- `artifactPath`
- `artifactHash`
- `decision: approved`
- `decidedBy`
- `decidedAt`
- `approvalRef: screen-approval:<slug>:<slice-id>:<artifactHash>`
- `notes`
- `requiredBefore: fe_implementation`
- `nextAllowedPhase: fe_implementation`
- `blockedReason: null`

Rejected sidecars record:

- `decision: rejected`
- `blockedReason` with the rejection reason
- `nextAllowedPhase: null`
- `requiredBefore: fe_implementation`

When an existing rejected decision is explicitly reapproved, the new sidecar records the previous decision in `history` and in notes.

## Hash freshness and FE gate consumption

Approval is valid for future FE implementation only when:

- `decision` is `approved`
- `artifactHash` matches the current mock screen artifact hash, or the selected live artifact summary hash when live artifact review is explicitly enabled
- mode: `mock` or `live` is the operator-reviewed artifact source for the sidecar
- `requiredBefore` is `fe_implementation`
- `nextAllowedPhase` is `fe_implementation`

If the mock screen artifact changes, `status` reports the current approval as stale and effective status as pending. Approve refuses stale approval replacement unless the operator passes `--reapprove` after reviewing the changed artifact.

## Schema

Schema path:

- `.pi/agent/state/schemas/screen-artifact-approval.schema.json`

The schema keeps the sidecar docs-visible and product-reviewable. It is intentionally separate from protected runtime JSON.

## Validation

Run:

```bash
./scripts/validate-screen-artifact-approval.sh
```

The validator checks unit tests, integration tests, TypeScript compile coverage for the helper and CLI, package script wiring, schema shape, documentation boundary wording, and static references.
