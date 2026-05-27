# Greenfield Foundation Contract

> **Note:** `apps/web/` and `services/api/` are **harness pilot fixtures**, not
> a product foundation. The "shell" language below describes the current
> shape of those fixtures, not authorization for ongoing product work on top
> of them. See
> [ADR-0004](../../adr/0004-apps-web-and-services-api-are-harness-fixtures.md)
> for the binding decision; "Future slices may add..." is conditional on a
> superseding ADR.

## Purpose
- Baseline contract for the initial greenfield scaffold slices.

## Current approved foundation
- Frontend shell exists under `apps/web` with a placeholder landing route (harness pilot fixture; see [ADR-0004](../../adr/0004-apps-web-and-services-api-are-harness-fixtures.md)).
- Backend shell exists under `services/api` with a bounded health-check entrypoint contract (harness pilot fixture; see [ADR-0004](../../adr/0004-apps-web-and-services-api-are-harness-fixtures.md)).
- Future slices may add UI structure, design primitives, auth boundaries, and integration wiring on top of this scaffold ONLY after a superseding ADR is accepted (per ADR-0004 lifecycle).

## Notes
- This document exists to back the previously approved issue-001 HITL gate.
- It is intentionally lightweight and records the current scaffold baseline rather than a full product spec.
