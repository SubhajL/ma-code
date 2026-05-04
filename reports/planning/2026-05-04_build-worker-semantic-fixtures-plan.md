# Planning Log — build-worker-semantic-fixtures

- Date: 2026-05-04
- Scope: Extend the local semantic fixture validator so frontend_worker, backend_worker, and infra_worker outputs are checked for concrete TDD evidence/validation rather than narration-only completion claims.
- Status: ready
- Related coding log: `logs/coding/2026-05-04_build-worker-semantic-fixtures.md`

## Goal
- Add local semantic fixtures and validator coverage for build-worker TDD behavior.
- Reject narration-only completion claims that lack concrete evidence or validation content.
- Keep the slice additive, local-only, and parser-oriented.

## Scope
- `.pi/agent/validation/prompt-semantics.json`
- `scripts/validate-prompt-semantics.sh`
- `logs/CURRENT.md`
- `reports/planning/2026-05-04_build-worker-semantic-fixtures-plan.md`
- `logs/coding/2026-05-04_build-worker-semantic-fixtures.md`
- optional docs/static/discoverability only if the fixture inventory or validator contract needs wording updates after implementation

## Acceptance Criteria
- Semantic validator supports `frontend_worker`, `backend_worker`, and `infra_worker` fixtures.
- Golden fixtures prove concrete TDD evidence/validation content passes for each build worker.
- Failing fixtures reject narration-only or evidence-free completion claims for each build worker.
- Local semantic validator passes for the expanded fixture inventory.
- Change lands through bounded worktree/branch, merges to main, and local main sync is recorded.

## TDD Sequence
- Add failing semantic fixtures first for the three build-worker roles.
- Run `bash scripts/validate-prompt-semantics.sh` and confirm it fails because the current validator does not support those roles or does not reject narration-only evidence.
- Implement the smallest validator and fixture-inventory changes that pass.
- Refactor minimally to keep parser rules compact and additive.
- Rerun local semantic validation and supporting gates.

## Risks
- Evidence rules could become too brittle and reject valid concise outputs.
- Frontend/backend use `## Evidence` while infra uses `## Validation`; validator logic must preserve that distinction.
- Scope could widen into prompt redesign or live proof, which is out of bounds.

## Validation Plan
- `bash scripts/validate-prompt-semantics.sh`
- `bash scripts/validate-prompt-contracts.sh`
- `git diff --check`
- `g-check`-style working-tree review before commit/merge
