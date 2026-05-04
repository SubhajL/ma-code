# Planning Log — global-skills-planning-ports

- Date: 2026-05-04
- Scope: Add bounded global skills for grill, PRD, issues, and refactor planning aligned with the existing `g-*` package.
- Status: ready
- Related coding log: `logs/coding/2026-05-04_global-skills-planning-ports.md`

## Goal
- Add explicit global skills `g-grill`, `g-prd`, `g-issues`, and `g-refactor` under `packages/pi-g-skills/skills/`.
- Keep the slice documentation-first and static-safety-first.
- Avoid Graphify runtime work in this slice.

## Scope
- `packages/pi-g-skills/README.md`
- `packages/pi-g-skills/docs/porting-matrix.md`
- `packages/pi-g-skills/skills/g-grill/SKILL.md`
- `packages/pi-g-skills/skills/g-prd/SKILL.md`
- `packages/pi-g-skills/skills/g-issues/SKILL.md`
- `packages/pi-g-skills/skills/g-refactor/SKILL.md`
- `.pi/agent/docs/product_planning_workflow.md`
- `.pi/agent/docs/deep_module_refactoring_workflow.md`
- `scripts/check-repo-static.sh`
- `scripts/validate-skill-routing.sh`
- `logs/CURRENT.md`
- paired planning/coding logs

## Acceptance Criteria
- New global skills exist with Pi-style structure and explicit output contracts.
- Package/docs discoverability surfaces mention the new skills accurately.
- Static/skill-routing validation covers the new global skills and passes.
- No Graphify runtime adapter or repo-local runtime behavior is added in this slice.

## TDD Sequence
- Add the smallest static validator expectations for the new skills/docs first.
- Run the checker and confirm RED because the new skill files/docs are still missing.
- Add the minimal skill/docs changes to satisfy the new contract.
- Add skill-routing validator coverage for explicit new skill loading.
- Rerun the relevant fast gates, then perform QCHECK and g-check review.

## Validation Plan
- `bash scripts/check-repo-static.sh`
- `bash scripts/validate-skill-routing.sh --skip-live`
- `bash scripts/validate-prompt-contracts.sh` only if the static checker change widens into prompt-surface expectations
- `git diff --check`
