# Frontend Packet Generation

Phase 8 adds a preview-only frontend packet generator for approved UI-facing product slices.

## Purpose

`harness:fe-packet` converts four already-approved slice artifacts into a valid frontend implementation task packet:

- approved mock screen artifact
- hash-bound screen approval sidecar
- current slice contract
- UI-facing slice plan entry

The generator uses Draft A: it reuses the existing task-packet schema instead of adding first-class `sliceArtifacts` fields.

## Commands

```bash
npm run harness:fe-packet -- --initiative <slug> --slice <slice-id> --dry-run
npm run harness:fe-packet -- --initiative <slug> --slice <slice-id> --apply
npm run validate:frontend-packet
```

## Behavior

- `--dry-run` renders a frontend packet preview to stdout and writes no files.
- `--apply` writes only packet preview artifacts:
  - `docs/initiatives/<slug>/packets/<slice-id>.frontend.packet.json`
  - `docs/initiatives/<slug>/packets/<slice-id>.frontend.packet.md`
- It creates no runtime tasks.
- It creates no queue jobs.
- It starts no worker sessions.
- It creates no backend packets; backend packets wait for a later phase and are handled by Phase 9 after FE validation.
- It does not implement product code.

## Gates

Generation blocks when:

- the mock screen artifact is missing
- the approval sidecar is missing
- the approval decision is not `approved`
- the approval hash does not match the current screen artifact
- the slice contract is missing
- the contract lacks explicit `allowedPaths`
- the contract lacks frontend TDD seed data
- the slice is not frontend/UI-facing

## Generated packet shape

The generated packet is a normal `TaskPacket` with:

- `assignedTeam: build`
- `assignedRole: frontend_worker`
- `workType: implementation`
- `domains: ["frontend"]`
- required `tddSlice`
- approved artifact and contract references in `filesToInspect` and `dependencies`
- frontend validation, UI wiring, and accessibility/state proof expectations
- Phase 7 `phaseLane: frontend_implementation` routing evidence, using verified fallback models until requested models are verified

## Migration boundary

This phase is intentionally additive. Future scheduler or queue integration must add explicit gates before consuming packet artifacts for dispatch.
