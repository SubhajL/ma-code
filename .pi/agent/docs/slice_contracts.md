# Slice Contracts

Phase 6 adds a deterministic, reviewable contract artifact between approved mock screens and FE/BE implementation.

## Purpose
- Convert a hash-bound approved mock screen artifact into a shared FE/BE contract.
- Keep frontend fixtures, backend fakes, UI states, errors, auth assumptions, and TDD seeds aligned before implementation starts.
- Provide stable contract paths and hashes future FE/BE packet phases can consume.

## Inputs
- Mock screen artifact: `docs/initiatives/<slug>/screen-artifacts/<slice-id>.mock-screen.json`
- Approval sidecar: `docs/initiatives/<slug>/screen-artifacts/<slice-id>.approval.json`
- Planning context:
  - `docs/initiatives/<slug>/prd.md`
  - `docs/initiatives/<slug>/backlog.md`
  - `docs/initiatives/<slug>/slice-plan.json`

Generation blocks when the screen artifact is missing, the approval sidecar is missing, the approval decision is not `approved`, or the current artifact hash differs from the approval hash.

## Commands
```bash
npm run harness:slice-contract -- --initiative <slug> --slice <slice-id> --dry-run
npm run harness:slice-contract -- --initiative <slug> --slice <slice-id> --apply
```

- `--dry-run` prints the contract preview and writes no files.
- `--apply` writes only:
  - `docs/initiatives/<slug>/contracts/<slice-id>.contract.json`
  - `docs/initiatives/<slug>/contracts/<slice-id>.contract.md`

## Contract contents
Generated contracts include:
- UI state mapping per approved screen.
- API/data contract placeholder scoped to the slice.
- Error shape and UI error-state mapping.
- Auth assumptions that remain explicit until backend implementation confirms them.
- Mock plan for frontend fixtures and backend fakes.
- TDD seeds for frontend and backend expectations.
- Out-of-scope notes from the initiative PRD.
- `nextAllowedPhase: fe_implementation`.

## Safety boundaries
Phase 6 does not create task packets, handoffs, queue jobs, worker sessions, or FE/BE implementation. It does not create task packets. It does not create queue jobs. It does not write `.pi/agent/state/runtime/*.json`.

FE implementation must not start until the approved screen artifact and the current slice contract are available for the same slice. Future FE/BE packet phases should carry the contract path and hash.

## Validation
```bash
npm run test:slice-contract
npm run validate:slice-contract
./scripts/validate-slice-contracts.sh
```
