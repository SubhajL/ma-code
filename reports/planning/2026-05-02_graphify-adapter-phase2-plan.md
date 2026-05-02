# Phase 2 Graphify Adapter Plan

## Discovery Path
- Loaded `g-planning`, `g-coding`, and `g-check` skill instructions from the repo-installed skill files.
- Attempted Auggie discovery first; Auggie timed out and recommended local fallback.
- Used local discovery (`find`, `rg`, targeted `read`) over `.pi/agent/extensions`, `tests/extension-units`, `tests/integration`, validator scripts, package/docs, and ignore/package manifest surfaces.
- Used `second_model_plan` to sanity-check the bounded adapter plan.

## Goal
- Add a smallest safe Graphify adapter extension with tests-first proof for fake binary detection, missing binary behavior, existing graph query, large-corpus approval, and managed output paths.

## Non-Goals
- Do not auto-install Graphify.
- Do not add a new role such as `system_analyst` yet.
- Do not make Graphify an Exa/live-web-search replacement.
- Do not add background watch/MCP/hook/Neo4j behavior.

## TDD Sequence
1. Add `tests/extension-units/graphify-adapter.test.ts` importing the not-yet-existing extension.
2. Run the focused unit test and confirm RED due missing extension.
3. Implement `.pi/agent/extensions/graphify-adapter.ts` with one bounded `graphify_adapter` tool.
4. Rerun focused unit tests to GREEN.
5. Add fake-binary integration test and validator wiring.
6. Run focused fast gates and g-check review.

## Acceptance Checks
- `node --import tsx --test tests/extension-units/graphify-adapter.test.ts` via an isolated temp runtime for RED/GREEN.
- `bash scripts/check-foundation-extension-compile.sh`
- `bash scripts/validate-extension-unit-tests.sh`
- `bash scripts/validate-core-workflows.sh`
- `bash scripts/check-repo-static.sh`
- `git diff --check`

## Risks
- Graphify CLI arguments may differ by version; fake binary proof validates wrapper safety, not every upstream CLI mode.
- Large-corpus file counting is a bounded guardrail, not a full content privacy scanner.
- Graphify graph evidence remains discovery evidence; important claims still require direct source inspection.
