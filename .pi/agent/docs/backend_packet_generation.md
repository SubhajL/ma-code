# Backend Packet Generation

Phase 9 adds a preview-only backend packet generator for product slices that have passed frontend validation.

## Purpose

`harness:be-packet` follows frontend validation and converts four already-approved artifacts into a valid backend implementation task packet:

- Phase 8 frontend packet artifact
- passed frontend validation evidence sidecar
- current slice contract
- backend-applicable slice plan entry

The generator uses Draft A: it reuses the existing task-packet schema instead of adding first-class `sliceArtifacts` fields or coupling product phase gates into the generic packet helper.

## Commands

```bash
npm run harness:be-packet -- --initiative <slug> --slice <slice-id> --dry-run
npm run harness:be-packet -- --initiative <slug> --slice <slice-id> --apply
npm run validate:backend-packet
```

## Behavior

- `--dry-run` renders a backend packet preview to stdout and writes no files.
- `--apply` writes only backend packet preview artifacts:
  - `docs/initiatives/<slug>/packets/<slice-id>.backend.packet.json`
  - `docs/initiatives/<slug>/packets/<slice-id>.backend.packet.md`
- It creates no runtime tasks.
- It creates no queue jobs.
- It starts no worker sessions.
- It does not modify frontend packet artifacts.
- It does not implement product code.

## Gates

Generation blocks when:

- the frontend validation evidence sidecar is missing
- frontend validation status is not `passed`
- frontend validation evidence points at a different frontend packet
- frontend validation evidence contract hash does not match the current contract
- the frontend packet artifact is missing or does not reference the current contract
- the slice contract is missing
- the contract lacks backend API/data expectations
- the contract lacks backend allowed paths
- the contract lacks backend TDD seed data
- the slice is not backend-applicable

## Frontend validation evidence sidecar

Phase 9 consumes:

```json
{
  "version": 1,
  "initiativeId": "<slug>",
  "sliceId": "slice-001",
  "phase": "fe_validation",
  "status": "passed",
  "frontendPacketPath": "docs/initiatives/<slug>/packets/slice-001.frontend.packet.json",
  "contractHash": "<sha256>",
  "validatedBehaviors": [],
  "commandsRun": [],
  "knownGaps": [],
  "completedAt": "ISO-8601"
}
```

Machine-readable schema:
- `.pi/agent/state/schemas/frontend-validation-evidence.schema.json`

## Generated packet shape

The generated packet is a normal `TaskPacket` with:

- `assignedTeam: build`
- `assignedRole: backend_worker`
- `workType: implementation`
- `domains: ["backend"]`
- required `tddSlice`
- FE evidence, FE packet, contract, and slice plan references in `filesToInspect` and `dependencies`
- backend unit/integration, API/handler wiring, auth/data/side-effect, migration/rollback proof expectations
- Phase 7 `phaseLane: backend_implementation` routing evidence, using verified fallback models until requested models are verified

## Migration boundary

This phase is intentionally additive and preview-only. Future scheduler or queue integration must add explicit gates before consuming backend packet artifacts for dispatch.
