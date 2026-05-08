# Product Intake Phase 1 Plan

## Goal
- Add a bounded `harness:product-intake` CLI wrapper for major product work intake.
- Reuse `initHarnessFeature` for clear apply-mode initiative scaffolds.
- Capture source description and intake readiness in `docs/initiatives/<slug>/intake.json`.

## Scope
- Public CLI: `npm run harness:product-intake -- --slug <slug> --description <text> --dry-run|--apply`.
- Tests cover dry-run no-write, clear apply, blocked ambiguous descriptions, duplicate slug protection, and JSON state shape.
- Docs/static/package wiring covers Phase 1 boundary: PRD/backlog before Stitch; no task/queue/Stitch/FE/BE packet generation.

## Non-goals
- No PRD synthesis.
- No backlog slicing.
- No Stitch generation.
- No task packet, queue job, frontend packet, or backend packet generation.
- No change to existing `harness:init-feature` behavior.

## TDD Slice
- First tracer behavior: dry-run with a clear product description reports planned initiative artifacts and writes no files.
- Public interface: `npm run harness:product-intake -- --slug <slug> --description <text> --dry-run`.
- Boundary dependencies: `initHarnessFeature`; filesystem writes under `docs/initiatives/<slug>/`; no queue/task/Stitch dependencies.

## Validation Plan
- RED: `node --import tsx --test tests/integration/harness-product-intake.test.ts` fails because `scripts/harness-product-intake.ts` is missing.
- GREEN: targeted product-intake test passes, then harness-init-feature regression passes.
- Static/package gates: `./scripts/validate-harness-package.sh`, `./scripts/check-repo-static.sh`, `git diff --check`.
- Core workflow gate only if core validator wiring changes.

## Risks
- Ambiguity detection is heuristic and should stay conservative.
- Package bootstrap wiring increases validation surface, but makes the command available in target repos.
