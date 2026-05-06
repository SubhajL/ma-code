# Intake Policy

This document defines when work may start directly and when it must first pass through bounded intake.

## Purpose
- keep major or ambiguous work from jumping straight into implementation
- keep small, clear slices fast
- preserve consistent repo bootstrap and major-feature startup behavior

## Intake trigger tiers
### Tier 1 — direct slice allowed
- use for small, bounded, clearly local changes
- examples:
  - typo fix
  - narrow bugfix
  - local handler tweak with existing acceptance
- allowed next step:
  - `g-planning` or direct bounded implementation when justified

### Tier 2 — planning required
- use for high-risk but still bounded changes
- examples:
  - auth rule tweak in one endpoint
  - schema change with local migration implications
  - infra config adjustment with bounded blast radius
- required next step:
  - `g-planning`
- also require:
  - stronger review and validation notes

### Tier 3 — full intake required
- use for ambiguous or cross-cutting work
- examples:
  - new product behavior
  - new major feature
  - cross-domain auth/schema/infra change
- required next steps:
  - `g-grill`
  - `g-prd`
  - `g-issues`

## Major feature rule
- every major feature should get a folder under `docs/initiatives/<feature-slug>/`
- minimum expected files:
  - `prd.md`
  - `backlog.md`
  - `decisions.md`

## Domain docs bootstrap rule
- create domain-neutral docs everywhere
- do not create `docs/frontend/` or `docs/backend/` by default
- create them only when the repo or feature actually introduces that domain
