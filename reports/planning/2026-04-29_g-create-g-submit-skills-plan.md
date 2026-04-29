# Planning Log — g-create-g-submit-skills

- Date: 2026-04-29
- Scope: Add bounded Pi skill ports for `g-create` and `g-submit`, plus the smallest routing/docs/validation updates needed so the new skills are actually discoverable and usable.
- Status: ready
- Related coding log: `logs/coding/2026-04-29_g-create-g-submit-skills.md`

## Goal
- Add `g-create` and `g-submit` to `packages/pi-g-skills` so the package no longer exposes only four `g-*` skills.
- Preserve the recognizable create/submit workflow names while adapting them to Pi-native logs and a bounded Git/GitHub workflow.

## Scope
- Create new skill files under `packages/pi-g-skills/skills/`.
- Update package docs to list and explain the new skills.
- Update the repo-local `g-skill-auto-route` extension and skill-routing validator so create/submit prompts can route intentionally and explicit `/skill:g-create` / `/skill:g-submit` are preserved.

## Files to Create or Edit
- `packages/pi-g-skills/skills/g-create/SKILL.md`
- `packages/pi-g-skills/skills/g-submit/SKILL.md`
- `packages/pi-g-skills/README.md`
- `packages/pi-g-skills/docs/porting-matrix.md`
- `.pi/settings.json`
- `.pi/agent/extensions/g-skill-auto-route.ts`
- `scripts/validate-skill-routing.sh`
- `logs/CURRENT.md`
- `logs/coding/2026-04-29_g-create-g-submit-skills.md`
- `reports/planning/2026-04-29_g-create-g-submit-skills-plan.md`

## Why Each File Exists
- The new `SKILL.md` files provide the missing skill ports.
- `README.md` and `porting-matrix.md` prevent the package/docs from falsely implying only four skills exist.
- `.pi/settings.json` makes the repo load the in-repo package skills directly instead of depending on a separate global reinstall.
- `g-skill-auto-route.ts` keeps the repo-local skill router aware of the new skill names and common create/submit intents.
- `validate-skill-routing.sh` provides executable proof that the new routing surface is wired.
- The log files keep this bounded feature group visible under the repo’s Pi logging convention.

## What Logic Belongs There
- `g-create`: pre-commit / create-artifact workflow for a bounded review set, with Graphite-first create flow when available and safe generic Git fallback guidance.
- `g-submit`: PR submission workflow with compact repo/PR inspection, Graphite-first submit flow when available and `gh` fallback guidance.
- Router: only intent detection and explicit-skill preservation, not PR automation.

## What Should Not Go There
- No repo-local queue/task runtime changes.
- No new provider-backed automation loops.
- No hard dependency on Graphite-only environments.
- No merge-to-main automation in these skills.

## Dependencies
- Existing `packages/pi-g-skills` package structure.
- Existing repo-local `g-skill-auto-route` extension and `validate-skill-routing.sh` validator.
- Existing `gh` / optional `gt` command availability only as skill guidance, not as package runtime helpers.

## Acceptance Criteria
- `g-create` and `g-submit` exist as bounded Pi skills under `packages/pi-g-skills/skills/`.
- Package docs clearly list six available `g-*` skills instead of four.
- Repo-local skill routing understands the two new skill names and representative create/submit intents without breaking existing four-skill behavior.
- Focused validation proves the routing/package surface is still wired.

## Likely Failure Modes
- Routing patterns become too broad and steal generic implementation prompts from `g-coding`.
- Docs and router diverge, leaving the new skills present but undiscoverable.
- The port reintroduces a hard Graphite dependency instead of bounded fallback guidance.

## Validation Plan
- Run `scripts/validate-skill-routing.sh --skip-live`.
- Read back the changed skill/docs/router files for alignment.
- Run a skeptical `g-check` review on the working-tree diff before claiming completion.

## Recommended Next Step
- Implement the two skill ports first, then tighten the smallest router/docs/validator surfaces needed to make them real and discoverable.
