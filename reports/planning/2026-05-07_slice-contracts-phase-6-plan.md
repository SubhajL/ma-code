# Planning Log: Phase 6 Slice Contracts

## Source
- User-provided Phase 6 plan: choose Draft A, conservative/reviewable contract generator helper plus CLI.

## Accepted Scope
- Add pure helper and CLI for slice contract generation.
- Require current approved mock screen artifact and hash-bound approval sidecar.
- Generate deterministic JSON and Markdown under `docs/initiatives/<slug>/contracts/`.
- Add schema, tests, validator, package/static/compile wiring, and docs.

## Non-goals
- Do not alter task-packet schema yet.
- Do not create task packets, handoffs, queue jobs, or worker sessions.
- Do not implement frontend/backend code.

## Validation Plan
- `node --import tsx --test tests/extension-units/slice-contracts.test.ts`
- `node --import tsx --test tests/integration/slice-contracts.test.ts`
- `./scripts/validate-slice-contracts.sh`
- `./scripts/check-foundation-extension-compile.sh`
- `bash scripts/check-repo-static.sh`
- `git diff --check`
