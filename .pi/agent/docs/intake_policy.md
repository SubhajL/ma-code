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
- safe entry point:
  - `npm run harness:product-intake -- --slug <feature-slug> --description "..." --dry-run`
  - `npm run harness:product-intake -- --slug <feature-slug> --description "..." --apply`
- required next steps:
  - `g-grill` when the intake is blocked or clarification questions remain
  - `g-prd` once intake is ready for PRD
  - `g-issues` after PRD approval

## Major feature rule
- every major feature should get a folder under `docs/initiatives/<feature-slug>/`
- `harness:product-intake --apply` writes `docs/initiatives/<feature-slug>/intake.json` to durably capture the source description and readiness status
- clear intake creates the minimum expected planning files:
  - `prd.md`
  - `backlog.md`
  - `decisions.md`
- blocked intake records focused clarification questions and does not create PRD/backlog/decisions scaffolds until the description is clear enough for PRD

## Phase 1 automation boundary
- PRD/backlog happen before Stitch
- Phase 1 product intake does not call Stitch
- Phase 1 product intake does not create task packets, queue jobs, frontend packets, or backend packets

## Domain docs bootstrap rule
- create domain-neutral docs everywhere
- do not create `docs/frontend/` or `docs/backend/` by default
- create them only when the repo or feature actually introduces that domain
