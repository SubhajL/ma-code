# Phase 8 Frontend Packet Generation Plan

- Task: task-1778211635128
- Decision: implement Draft A as an additive frontend packet generator helper and preview-only CLI.

## Acceptance
- Generate a valid build/frontend_worker implementation task packet from approved screen artifact, hash-bound approval, current slice contract, and UI-facing slice plan.
- Block missing, rejected, stale, non-UI, missing-contract, missing allowedPaths, and missing TDD seed inputs.
- Use existing `generateTaskPacket` with `phaseLane: frontend_implementation` or verified fallback routing evidence.
- CLI supports dry-run and apply-to-preview only; no runtime tasks, queue jobs, worker sessions, BE packets, or product code.
- Targeted tests and validators pass.

## TDD Tracer
- First behavior: approved screen artifact + valid contract produces a frontend implementation packet with required TDD slice and artifact references.

## Implementation Notes
- Extend task-packet routing input minimally for `phaseLane` so generated packets visibly consume Phase 7 routing.
- Keep slice artifact references in existing packet fields; do not add first-class `sliceArtifacts` schema.
