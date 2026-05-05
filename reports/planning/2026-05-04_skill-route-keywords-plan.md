# Planning Log — skill-route-keywords

- Date: 2026-05-04
- Scope: Add bounded semantic auto-route keywords for the new global skills.
- Status: ready
- Related coding log: `logs/coding/2026-05-04_skill-route-keywords.md`

## Goal
- Teach the g-skill auto-router to recognize suitable keyword-based intents for `g-grill`, `g-prd`, `g-issues`, and `g-refactor`.

## Scope
- `.pi/agent/extensions/g-skill-auto-route.ts`
- `scripts/validate-skill-routing.sh`
- `logs/CURRENT.md`
- paired planning/coding logs

## Acceptance Criteria
- Semantic keyword prompts route to the new skills without needing explicit `/skill:`.
- The routing validator covers the new keyword routes and passes.
- The slice remains bounded to routing/validation surfaces.

## TDD Sequence
- Add new keyword-based expectations to the skill-routing validator first.
- Run the validator and confirm RED because the router does not yet recognize the new keywords.
- Implement the smallest routing-pattern changes to satisfy the expectations.
- Rerun the validator to GREEN and repeat enough times for flake confidence.

## Validation Plan
- `bash scripts/validate-skill-routing.sh --skip-live`
- `git diff --check`
