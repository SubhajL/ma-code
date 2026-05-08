# Mock Stitch Artifact Phase 4 Plan

## Goal
- Implement mock-only Stitch screen artifact generation that consumes Phase 3 prompt metadata.

## Scope
- Add pure mock artifact adapter/helper.
- Add JSON schema for mock screen artifacts.
- Add CLI wrapper with `--dry-run`, `--apply`, and JSON output.
- Add validator, docs, package/static/compile wiring, and unit/integration tests.
- Merge validated work back to `main` and sync the local root repo.

## Non-Goals
- No live Stitch calls.
- No provider calls.
- No task packet or queue job creation.
- No FE/BE implementation behavior.
- No task-packet schema or queue runner changes.

## First TDD Slice
- Given a valid Phase 3 prompt Markdown and prompt metadata, `npm run harness:stitch-artifact -- --initiative <slug> --slice <slice-id> --dry-run --json` returns deterministic mock screen artifact metadata and writes no files.

## Acceptance Criteria
- Valid prompt metadata produces deterministic mock artifact JSON.
- Dry-run writes no files.
- Apply writes only screen artifact JSON and Markdown under `docs/initiatives/<slug>/screen-artifacts/`.
- Missing prompt file blocks clearly.
- Missing or stale prompt hash blocks; no `--ignore-hash` escape exists in this phase.
- Artifact metadata records `liveStitchCalled: false`, `taskPacketsCreated: false`, and `queueJobsCreated: false`.
- No task packets or queue jobs are created.
- Mock artifact includes artifact id, source prompt path/hash, screen list, screen states, accessibility notes, and `nextAllowedPhase: "screen_approval"`.
- Targeted tests, validator, compile/static gates, and `git diff --check` pass.

## Validation Plan
- `node --import tsx --test tests/extension-units/stitch-artifact-adapter.test.ts`
- `node --import tsx --test tests/integration/stitch-artifact.test.ts`
- `./scripts/validate-stitch-artifacts.sh`
- `./scripts/check-foundation-extension-compile.sh`
- `./scripts/check-repo-static.sh`
- `git diff --check`
