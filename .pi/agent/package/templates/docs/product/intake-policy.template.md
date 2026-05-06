# Intake Policy

This file explains when work may start directly and when it must first pass through bounded intake.

## Intake trigger tiers
### Tier 1 — direct slice allowed
- small, bounded, clearly local changes
- examples:
  - typo fix
  - narrow bugfix
  - local handler tweak with existing acceptance
- recommended next step:
  - `g-planning` or direct bounded implementation when justified

### Tier 2 — planning required
- high-risk but still bounded changes
- examples:
  - auth rule tweak in one endpoint
  - schema change with local migration implications
  - infra config adjustment with bounded blast radius
- required next step:
  - `g-planning`
- also require:
  - stronger review notes
  - stronger validation notes

### Tier 3 — full intake required
- ambiguous or cross-cutting work
- examples:
  - new product behavior
  - new major feature
  - cross-domain auth/schema/infra change
- required next steps:
  - `g-grill`
  - `g-prd`
  - `g-issues`
