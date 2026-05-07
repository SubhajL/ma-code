# Planning Log — full-chain-harness-phase-7

- Date: 2026-05-07
- Scope: Domain governance policy/helper, packet enforcement, frontend-safety parity, conditional domain docs bootstrap
- Status: in_progress
- Branch: `split/task-phase7-domain-governance`

## Goal
- Add executable domain governance so bounded slices declare domains, assigned roles, and path scope consistently without splitting shared intake too early.

## Acceptance Criteria
- A machine-readable domain governance policy exists.
- A helper can assess frontend/backend role/domain/path coherence.
- Task packet generation becomes governance-aware for frontend/backend mismatches.
- Mixed-domain slices are explicit and justified rather than accidental.
- Frontend has a safety/guideline surface comparable to backend.
- `docs/frontend` and `docs/backend` are generated only when those domains are actually relevant.
- Existing shared intake remains shared; domain split happens later at slice/packet level.
- Required checks pass:
  - `node --import tsx --test tests/extension-units/domain-governance.test.ts`
  - `node --import tsx --test tests/integration/domain-governance.test.ts`
  - `./scripts/validate-domain-governance.sh`

## TDD Slice
- First tracer behavior: backend domain + backend worker passes, while backend domain + frontend worker fails for the right reason.
- Public interface: `assessDomainGovernance(...)` and `generateTaskPacket(...)` after integration.
- Boundary dependencies: real policy JSON, real packet policies/team fixtures, temp feature bootstrap repos.
- Out of scope: merge/release behavior, runtime daemon behavior, automatic slice splitting, broad safe-bash path-domain enforcement.

## Rollout Plan
1. Add domain governance unit tests and helper/policy.
2. Add task-packet integration tests and packet enforcement.
3. Add conditional docs bootstrap tests and feature bootstrap extension.
4. Add frontend-safety skill, docs, package/template wiring, and dedicated validator.
5. Validate, review, submit, PR-gate, merge, and sync local root main.
