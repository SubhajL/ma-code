# Coding Log — g-create-g-submit-skills

- Date: 2026-04-29
- Scope: Add missing `g-create` and `g-submit` Pi skill ports and the smallest routing/docs/validation updates needed to make them discoverable.
- Status: complete
- Branch: `split/task-1777437808698-g-create-g-submit-skills`
- Related planning log: `reports/planning/2026-04-29_g-create-g-submit-skills-plan.md`

## Task Group
- Confirm whether `g-create` / `g-submit` were already implemented.
- Add the missing skill ports if absent.
- Keep the change bounded to package skills, routing, docs, and focused validation.

## Files Investigated
- `packages/pi-g-skills/README.md`
- `packages/pi-g-skills/docs/porting-matrix.md`
- `packages/pi-g-skills/skills/g-coding/SKILL.md`
- `packages/pi-g-skills/skills/g-check/SKILL.md`
- `.pi/settings.json`
- `.pi/agent/extensions/g-skill-auto-route.ts`
- `scripts/validate-skill-routing.sh`
- `~/.codex/skills/g-submit/SKILL.md`
- `~/.claude/skills/g-submit/SKILL.md`
- `logs/CURRENT.md`
- `logs/README.md`

## Files Changed
- `.pi/settings.json`
- `.pi/agent/extensions/g-skill-auto-route.ts`
- `scripts/validate-skill-routing.sh`
- `packages/pi-g-skills/README.md`
- `packages/pi-g-skills/docs/porting-matrix.md`
- `packages/pi-g-skills/skills/g-create/SKILL.md`
- `packages/pi-g-skills/skills/g-submit/SKILL.md`
- `logs/CURRENT.md`
- `logs/coding/2026-04-29_g-create-g-submit-skills.md`
- `reports/planning/2026-04-29_g-create-g-submit-skills-plan.md`

## Runtime / Validation Evidence
- No practical RED run was captured for the new skills because this was bounded package/routing scaffolding rather than a pre-existing failing runtime path; validation focused on positive discovery/routing proof after implementation.
- Verified repo-local issue before implementation: `packages/pi-g-skills` only contained `g-planning`, `g-coding`, `g-check`, and `g-review`.
- Verified available command-line tools in this environment: `gt` and `gh` are installed.
- Verified bounded implementation lane: `/Users/subhajlimanond/dev/ma-code-worktrees/task-1777437808698-g-create-g-submit-skills` on branch `split/task-1777437808698-g-create-g-submit-skills`.
- Validation passed: `bash scripts/validate-skill-routing.sh --skip-live` -> `Skill-routing validation PASS`.
- Validation passed: `printf '{"id":1,"type":"get_commands"}\n' | pi --mode rpc --no-session` now shows project-local `skill:g-create` and `skill:g-submit` from `packages/pi-g-skills/skills/...` after adding the package skill path to `.pi/settings.json`.
- Validation passed: `git diff --check` -> no output.

## Key Findings
- The recurring `/skill:g-create` / `/skill:g-submit` issue is real in this repo: the package currently ports only four `g-*` skills.
- The existing package docs and repo-local router/validator also assume only four skills.
- The repo’s `.pi/settings.json` was not loading `packages/pi-g-skills/skills`, so even after adding the files the project would still rely on a separate global install unless the local skill path was added.
- There is an upstream `g-submit` skill available locally under `~/.codex/skills`, but no equivalent `g-create` file was found.

## Decisions Made
- Implement `g-create` and `g-submit` as bounded Pi skill ports.
- Adapt create/submit flow to Pi-native logs plus Graphite-first-when-available guidance instead of a hard Graphite-only dependency.
- Add `packages/pi-g-skills/skills` to `.pi/settings.json` so the repo can load the in-tree skills directly.
- Keep the router update narrow so only explicit create/submit intents route away from `g-coding`.

## Known Risks
- Over-broad route patterns could steal normal coding prompts.
- The package port should not imply that PR creation/merge is safe from dirty `main` or without active-task discipline.

## Current Outcome
- Added bounded Pi skill ports for `g-create` and `g-submit` under `packages/pi-g-skills/skills/`.
- Updated package docs to list all six `g-*` skills and clarified that create/submit are Graphite-first only when `gt` is actually available.
- Updated `.pi/settings.json` so the repo loads the in-tree package skills directly, which makes `skill:g-create` and `skill:g-submit` discoverable without relying on a separate global reinstall.
- Extended the repo-local skill router and validator to recognize representative create/submit intents and preserve explicit `/skill:g-create` / `/skill:g-submit` commands.

## Next Action
- If the user wants these changes landed, restore runtime bookkeeping files to `HEAD`, run one final staged `g-check` pass on the working tree, and then create/submit the branch PR from this dedicated worktree.

## Implementation Summary (2026-04-29 12:15:00 +0700)

### Goal
- Add the missing `g-create` and `g-submit` Pi skill ports and wire them into the smallest repo/package surfaces needed for real discoverability.

### What changed
- Added new package skills:
  - `packages/pi-g-skills/skills/g-create/SKILL.md`
  - `packages/pi-g-skills/skills/g-submit/SKILL.md`
- Updated package docs:
  - `packages/pi-g-skills/README.md`
  - `packages/pi-g-skills/docs/porting-matrix.md`
- Updated project-local skill loading:
  - `.pi/settings.json`
- Updated repo-local router and validation:
  - `.pi/agent/extensions/g-skill-auto-route.ts`
  - `scripts/validate-skill-routing.sh`
- Added paired planning/coding logs for this bounded feature group.

### TDD evidence
- RED:
  - none captured
  - reason: this was skill/package/routing scaffolding and the bounded validation surface existed only after adding the new skills and route cases.
- GREEN:
  - `bash scripts/validate-skill-routing.sh --skip-live`
  - `printf '{"id":1,"type":"get_commands"}\n' | pi --mode rpc --no-session`
  - `git diff --check`

### Wiring verification evidence
- Project-local Pi skill loading now includes `../packages/pi-g-skills/skills` via `.pi/settings.json`.
- Pi command discovery now shows:
  - `skill:g-create`
  - `skill:g-submit`
- Repo-local routing helper now recognizes create/submit intents and explicit skill commands for the two new skills.
- `scripts/validate-skill-routing.sh` now loads and exercises all six package skills instead of four.

### Behavior / risk notes
- `g-create` and `g-submit` preserve the recognizable Codex workflow names, but remain bounded to Pi-native Git/GitHub usage with Graphite-first guidance only when `gt` is available.
- No merge-to-main automation was added.
- Route-pattern breadth remains the main residual risk; validation currently covers helper classification and compile/local-wiring proof, not a default live provider-backed create/submit probe.

## Review (2026-04-29 12:20:00 +0700) - working-tree

### Reviewed
- Repo: `/Users/subhajlimanond/dev/ma-code-worktrees/task-1777437808698-g-create-g-submit-skills`
- Branch: `split/task-1777437808698-g-create-g-submit-skills`
- Scope: `working-tree`
- Commands Run:
  - `git status --short`
  - `git diff --stat`
  - `sed -n '1,220p' packages/pi-g-skills/skills/g-create/SKILL.md`
  - `sed -n '1,220p' packages/pi-g-skills/skills/g-submit/SKILL.md`
  - `bash scripts/validate-skill-routing.sh --skip-live`
  - `printf '{"id":1,"type":"get_commands"}\n' | pi --mode rpc --no-session`
  - `git diff --check`

### Findings
CRITICAL
- none

HIGH
- none

MEDIUM
- none

LOW
- live provider-backed routing proof for `g-create` / `g-submit` remains optional and was skipped here to avoid unnecessary spend.
  - Why it matters: helper-level and project-local discovery proof is strong, but not the same as a live provider-backed route execution.
  - Fix direction: run `scripts/validate-skill-routing.sh` without `--skip-live` once one bounded live proof is worth the spend.

### Open Questions / Assumptions
- Assumed the right bounded behavior is Graphite-first guidance with Git/GitHub fallback, not a hard Graphite-only dependency.
- Assumed repo-local project skill loading is desirable so the fix works without a separate package reinstall.

### Recommended Tests / Validation
- `bash scripts/validate-skill-routing.sh --skip-live`
- one bounded live `validate-skill-routing.sh` run later if provider-backed proof is needed

### Rollout Notes
- The project can now discover `g-create` and `g-submit` directly from the in-repo package path.
- No repo runtime/control behavior changed beyond skill routing and skill-path discovery.

### Review Verdict
- no_required_fixes

## Follow-up Implementation Summary (2026-04-29 12:30:00 +0700)

### Goal
- Close the remaining low-risk follow-up by adding default live provider-backed route proof for `g-create` and `g-submit` to the skill-routing validator, then rerun the validator with live probes enabled.

### Files changed
- `scripts/validate-skill-routing.sh`

### RED evidence
- `grep -n "live create route\|live submit route" scripts/validate-skill-routing.sh`
- Result: exited with code 1 because the validator had no live create/submit checks yet.

### GREEN evidence
- `grep -n "live create route\|live submit route" scripts/validate-skill-routing.sh`
- Result: now finds `7. live create route` and `8. live submit route`.
- `bash scripts/validate-skill-routing.sh --skip-live`
- Result: `Skill-routing validation PASS`.
- `bash scripts/validate-skill-routing.sh`
- Result: `Skill-routing validation PASS`.
- `git diff --check`
- Result: no output.

### Wiring verification evidence
- `scripts/validate-skill-routing.sh` now runs `check_7_live_create` and `check_8_live_submit` in the default live path.
- `reports/validation/2026-04-29_skill-routing-validation-script.json` now records:
  - `7. live create route` -> PASS
  - `8. live submit route` -> PASS

### Behavior / risk notes
- The live proof remains bounded to one validator run.
- The live proof exercises raw create/submit prompts through the repo-local routing extension rather than creating real branches/PRs, which keeps the provider-backed proof cheap and safe.

## Review (2026-04-29 12:36:00 +0700) - working-tree

### Reviewed
- Repo: `/Users/subhajlimanond/dev/ma-code-worktrees/task-1777437808698-g-create-g-submit-skills`
- Branch: `split/task-1777437808698-g-create-g-submit-skills`
- Scope: `working-tree`
- Commands Run:
  - `git status --short --branch`
  - `git diff --stat`
  - `git diff -- scripts/validate-skill-routing.sh`
  - `bash scripts/validate-skill-routing.sh --skip-live`
  - `bash scripts/validate-skill-routing.sh`
  - `git diff --check`

### Findings
CRITICAL
- none

HIGH
- none

MEDIUM
- none

LOW
- none

### Open Questions / Assumptions
- none

### Recommended Tests / Validation
- keep `bash scripts/validate-skill-routing.sh --skip-live` in normal local/CI proof
- use the default live `bash scripts/validate-skill-routing.sh` only when one bounded provider-backed route proof is worth the spend

### Rollout Notes
- keep validation report artifacts and audit-log noise out of the committed diff
- the landed scope should stay limited to skill ports, local skill loading, routing, validator coverage, and paired logs

### Review Verdict
- no_required_fixes
