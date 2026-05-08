# Phase 5 Screen Artifact Approval Plan

## Goal
Add a durable, docs-adjacent approval sidecar for Phase 4 mock screen artifacts before FE implementation can proceed.

## Discovery Path
- Used `/skill:g-coding` workflow.
- Auggie discovery attempted first and unavailable due credits; used local fallback with `rg` and direct inspection of Stitch artifact helper/CLI/tests/validators/docs.
- Relevant patterns: `.pi/agent/extensions/stitch-artifact-adapter.ts`, `scripts/harness-stitch-artifact.ts`, `scripts/validate-stitch-artifacts.sh`, `tests/extension-units/stitch-artifact-adapter.test.ts`, `tests/integration/stitch-artifact.test.ts`.

## TDD Slice
- First tracer: approving a valid mock screen artifact writes `<slice>.approval.json` with `decision: approved` and matching `artifactHash`.
- Public interface: `npm run harness:screen-approval -- approve --initiative <slug> --slice <slice-id> --by <name> --note <text>`.
- Boundary dependencies: filesystem under `docs/initiatives/<slug>/screen-artifacts/`; no task/queue/runtime JSON APIs; no live Stitch.

## Validation
- `node --import tsx --test tests/extension-units/screen-artifact-approval.test.ts`
- `node --import tsx --test tests/integration/screen-artifact-approval.test.ts`
- `./scripts/validate-screen-artifact-approval.sh`
- `./scripts/check-foundation-extension-compile.sh`
- `./scripts/check-repo-static.sh`
- `git diff --check`
