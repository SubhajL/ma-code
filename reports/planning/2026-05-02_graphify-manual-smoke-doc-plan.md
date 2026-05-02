# Planning Log — graphify-manual-smoke-doc

- Date: 2026-05-02
- Scope: Add a tiny manual Graphify adapter smoke documentation path and static wiring proof.
- Status: ready
- Related coding log: `logs/coding/2026-05-02_graphify-manual-smoke-doc.md`

## Goal
- Document how an operator can run the Graphify adapter against a tiny fixture repo and verify generated artifacts stay out of source diffs.

## Scope
- Add manual smoke guidance to `.pi/agent/docs/graphify_adapter.md`.
- Add a cheap static check so the manual smoke path does not drift out of docs.
- Keep runtime behavior unchanged.

## Files to Create or Edit
- `.pi/agent/docs/graphify_adapter.md`
- `scripts/check-repo-static.sh`
- `logs/CURRENT.md`
- `logs/coding/2026-05-02_graphify-manual-smoke-doc.md`
- `reports/planning/2026-05-02_graphify-manual-smoke-doc-plan.md`

## Why Each File Exists
- The adapter doc is the operator-facing Graphify runtime reference.
- The static check enforces the manual smoke guidance exists.
- Logs capture RED/GREEN evidence and review/submission notes.

## What Logic Belongs There
- Manual smoke commands and expected cleanliness/artifact outcomes.
- Static doc-wiring assertions only.

## What Should Not Go There
- New Graphify adapter runtime logic.
- New generated artifacts or committed validation reports.
- Broad docs restructuring.

## Dependencies
- Existing `scripts/validate-graphify-discovery.sh --smoke` path.
- Existing `.pi/agent/artifacts/graphify/` ignore behavior.

## Acceptance Criteria
- Graphify adapter docs describe the tiny-fixture smoke path.
- Docs tell operators to verify generated reports/artifacts stay out of source diff.
- Static validation fails before the doc addition and passes after it.
- PR is merged and local main is synced.

## Likely Failure Modes
- Documenting an ad hoc command that bypasses managed artifact controls.
- Accidentally committing generated validation reports.
- Adding runtime behavior when docs are sufficient.

## Validation Plan
- `bash scripts/check-repo-static.sh`
- `bash scripts/validate-graphify-discovery.sh`
- `git diff --check`
- g-check working-tree review

## Recommended Next Step
- Validate, review, commit, PR, merge, and sync local main.
