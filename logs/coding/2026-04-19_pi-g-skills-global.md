# Coding Log — pi-g-skills-global

- Date: 2026-04-19
- Scope: Build a reusable Pi package that ports Codex global skills into Pi under the original `g-*` names, using Pi-style logs/index and bounded runtime helpers.
- Status: complete
- Branch: ma-code/logs-planning-20260417
- Related planning log: `reports/planning/2026-04-19_pi-g-skills-global-plan.md`

## Task Group
- Create a global Pi package under `packages/pi-g-skills`.
- Port `g-planning`, `g-coding`, `g-check`, and `g-review`.
- Add `auggie_discover` and `second_model_plan` extensions.
- Use Pi-style logs/index rather than Codex `.codex` pointers.

## Files Investigated
- `AGENTS.md`
- `logs/README.md`
- `logs/CURRENT.md`
- `logs/coding/TEMPLATE.md`
- `reports/planning/TEMPLATE.md`
- `.pi/agent/docs/auggie_mcp_integration_contract.md`
- `.pi/agent/docs/auggie_and_second_model_usage.md`
- `.pi/agent/docs/second_model_planning_contract.md`
- `.pi/agent/docs/codex_skill_patterns_for_pi_harness.md`
- `.pi/agent/extensions/auggie-discovery.ts`
- `.pi/agent/extensions/second-model-planning.ts`
- `~/.codex/skills/g-planning/SKILL.md`
- `~/.codex/skills/g-coding/SKILL.md`
- `~/.codex/skills/g-check/SKILL.md`
- `~/.codex/skills/g-review/SKILL.md`
- Pi docs: `README.md`, `docs/skills.md`, `docs/packages.md`

## Files Changed
- `logs/CURRENT.md`
- `reports/planning/2026-04-19_pi-g-skills-global-plan.md`
- `logs/coding/2026-04-19_pi-g-skills-global.md`
- `/Users/subhajlimanond/.pi/agent/settings.json`
- `packages/pi-g-skills/package.json`
- `packages/pi-g-skills/README.md`
- `packages/pi-g-skills/docs/pi-log-convention.md`
- `packages/pi-g-skills/docs/porting-matrix.md`
- `packages/pi-g-skills/skills/g-planning/SKILL.md`
- `packages/pi-g-skills/skills/g-coding/SKILL.md`
- `packages/pi-g-skills/skills/g-check/SKILL.md`
- `packages/pi-g-skills/skills/g-review/SKILL.md`
- `packages/pi-g-skills/extensions/auggie-discovery.ts`
- `packages/pi-g-skills/extensions/second-model-opus.ts`
- `packages/pi-g-skills/extensions/lib/process-utils.ts`
- `packages/pi-g-skills/extensions/bin/auggie-discovery-bridge.py`

## Runtime / Validation Evidence
- No RED run was practical for this work because it was greenfield package scaffolding rather than a pre-existing failing behavior. Validation therefore focused on compile/load/runtime fallback behavior after implementation.
- TypeScript compile validation:
  - `npx tsc --noEmit --skipLibCheck --moduleResolution nodenext --module nodenext --target es2022 --lib es2022,dom --types node src/auggie-discovery.ts src/second-model-opus.ts`
  - Result: `TS_COMPILE_OK`
- Python syntax validation:
  - `python3 -m py_compile /Users/subhajlimanond/dev/ma-code/packages/pi-g-skills/extensions/bin/auggie-discovery-bridge.py`
  - Result: `PY_COMPILE_OK`
- Explicit skill loading validation:
  - `printf '{"id":1,"type":"get_commands"}\n' | pi --mode rpc --no-session --no-skills --skill /Users/subhajlimanond/dev/ma-code/packages/pi-g-skills/skills/g-planning --skill /Users/subhajlimanond/dev/ma-code/packages/pi-g-skills/skills/g-coding --skill /Users/subhajlimanond/dev/ma-code/packages/pi-g-skills/skills/g-check --skill /Users/subhajlimanond/dev/ma-code/packages/pi-g-skills/skills/g-review`
  - Result: `skill:g-planning`, `skill:g-coding`, `skill:g-check`, and `skill:g-review` were discovered from the package paths.
- Direct extension runtime validation:
  - `pi --no-session --no-extensions -e /Users/subhajlimanond/dev/ma-code/packages/pi-g-skills/extensions/auggie-discovery.ts --mode json "Use the auggie_discover tool with question 'Where is the Pi log convention documented in this repo?' and answer in one sentence whether fallback was recommended."`
  - Result: packaged bridge executed in `command` mode and returned explicit `fallbackRecommended: true` because local Auggie credits are exhausted.
- Direct second-model runtime validation:
  - `pi --no-session --no-extensions -e /Users/subhajlimanond/dev/ma-code/packages/pi-g-skills/extensions/second-model-opus.ts --mode json "Use the second_model_plan tool with goal 'Plan a bounded docs-only change', contextSummary 'docs only', and primaryPlan 'edit one markdown file with a small clarification'. Then answer in one sentence whether it used Claude Opus 4.6 or fell back."`
  - Result: tool selected `anthropic/claude-opus-4-6`, failed cleanly on insufficient Anthropic credits, and returned explicit fallback to `openai-codex/gpt-5.4`.
- Disposable package-install validation:
  - `pi install -l /Users/subhajlimanond/dev/ma-code/packages/pi-g-skills` in a temp directory, followed by `pi --mode rpc --no-session` and runtime prompts.
  - Result: package extension resources loaded correctly from installed package paths; installed skill-name collisions with existing `~/.codex/skills` were observed and documented.
- Global install + source switch:
  - `cp /Users/subhajlimanond/.pi/agent/settings.json /Users/subhajlimanond/.pi/agent/settings.json.bak-2026-04-19-0715 && pi install /Users/subhajlimanond/dev/ma-code/packages/pi-g-skills`
  - edited `/Users/subhajlimanond/.pi/agent/settings.json` to remove `"skills": ["~/.codex/skills"]`
  - `printf '{"id":1,"type":"get_commands"}\n' | pi --mode rpc --no-session`
  - `pi --no-session --print "Use the g-planning skill and return only the required top-level section headers for a docs-only clarification task."`
  - Result: package-provided `g-planning`, `g-coding`, `g-check`, and `g-review` now resolve from `packages/pi-g-skills`; the smoke test returned the exact package `g-planning` section headers.

## Key Findings
- Pi-global packaging is the correct surface for this port; repo-local harness orchestration was intentionally avoided.
- The port preserved the original names `g-planning`, `g-coding`, `g-check`, and `g-review`.
- `g-planning` and `g-coding` now explicitly preserve TDD, RED/GREEN evidence expectations, wiring verification, and `g-check` handoff.
- Pi-style log/index mapping is now documented and encoded into the port (`logs/CURRENT.md`, `logs/coding/`, `reports/planning/`).
- The Opus-only second-model behavior and Auggie-first fallback behavior are implemented as runtime helpers rather than prompt-only rules.
- Pi skill-name collision behavior matters: first skill found wins, so environments that already load `g-*` skills from `~/.codex/skills` must disable that source before relying on the package-provided `g-*` skills.

## Decisions Made
- Package name/path: `packages/pi-g-skills`.
- Included skills: `g-planning`, `g-coding`, `g-check`, `g-review`.
- Included extensions: `auggie_discover` and Opus-only `second_model_plan`.
- Used Pi-native log pointer conventions instead of `.codex/coding-log.current`.
- Added README guidance for skill-name collisions so the operator can disable old sources when using same-name global skills.

## Known Risks
- If Pi is already loading `g-*` skills from another source such as `~/.codex/skills`, those may shadow the package-provided skills until the older source is disabled.
- Validation now covers both disposable package installation and one persistent real global install into the operator’s live Pi config; remaining risk is around future config drift rather than missing install coverage.
- Auggie validation reflects the current environment’s credit exhaustion path, not a successful semantic discovery path.
- Opus-4.6 validation reflects the current environment’s Anthropic credit failure path, not a successful second-model synthesis path.

## Current Outcome
- The package was implemented under `packages/pi-g-skills`.
- Skills, docs, and runtime helpers are present and validated for syntax/load/fallback behavior.
- The package is globally installed in the user Pi config.
- Conflicting `~/.codex/skills` loading was disabled in `/Users/subhajlimanond/.pi/agent/settings.json`.
- `g-planning`, `g-coding`, `g-check`, and `g-review` now resolve from the installed package.

## Next Action
- Optionally re-enable selected non-conflicting legacy skills from another source if you still want them, but keep `g-*` owned by this package.
- If needed, restore the previous global Pi settings from `/Users/subhajlimanond/.pi/agent/settings.json.bak-2026-04-19-0715`.

## Implementation Summary (2026-04-19 07:08:00 +0700)

### Goal
- Build a reusable Pi package that ports Codex `g-*` skills into Pi globally with Pi-style log/index mapping and bounded runtime helpers.

### What changed
- Added package manifest, README, and docs for the Pi-global `g-*` port.
- Ported `g-planning`, `g-coding`, `g-check`, and `g-review` into Pi skills.
- Added `auggie_discover` and `second_model_plan` extensions, plus a shared subprocess helper and Auggie CLI bridge.
- Updated `logs/CURRENT.md` to point at the active planning/coding logs for this bounded task.

### TDD evidence
- RED:
  - none produced
  - reason: this was greenfield package scaffolding; there was no pre-existing failing package/test harness to drive a traditional RED-first loop without first creating the entire package surface.
- GREEN:
  - `npx tsc --noEmit --skipLibCheck --moduleResolution nodenext --module nodenext --target es2022 --lib es2022,dom --types node src/auggie-discovery.ts src/second-model-opus.ts`
  - `python3 -m py_compile /Users/subhajlimanond/dev/ma-code/packages/pi-g-skills/extensions/bin/auggie-discovery-bridge.py`
  - `printf '{"id":1,"type":"get_commands"}\n' | pi --mode rpc --no-session --no-skills --skill /Users/subhajlimanond/dev/ma-code/packages/pi-g-skills/skills/g-planning --skill /Users/subhajlimanond/dev/ma-code/packages/pi-g-skills/skills/g-coding --skill /Users/subhajlimanond/dev/ma-code/packages/pi-g-skills/skills/g-check --skill /Users/subhajlimanond/dev/ma-code/packages/pi-g-skills/skills/g-review`
  - direct `pi` runtime probes for `auggie_discover` and `second_model_plan`

### Wiring verification evidence
- Package manifest wiring:
  - `packages/pi-g-skills/package.json` exposes `pi.extensions` and `pi.skills`
- Skill registration:
  - explicit `--skill` loading discovered `skill:g-planning`, `skill:g-coding`, `skill:g-check`, `skill:g-review`
- Extension registration:
  - direct `pi -e .../auggie-discovery.ts` invoked `auggie_discover`
  - direct `pi -e .../second-model-opus.ts` invoked `second_model_plan`
- Installed package wiring:
  - disposable `pi install -l /Users/subhajlimanond/dev/ma-code/packages/pi-g-skills` loaded package extension resources from installed paths

### Behavior / risk notes
- Auggie fallback is explicit and bounded.
- Second-model fallback is explicit and remains restricted to Claude Opus 4.6 for model 2.
- Same-name skill collisions remain an operator concern and are documented.

## Review (2026-04-19 07:09:00 +0700) - working-tree

### Reviewed
- Repo: `/Users/subhajlimanond/dev/ma-code`
- Branch: `ma-code/logs-planning-20260417`
- Scope: `working-tree`
- Commands Run:
  - `find packages/pi-g-skills -type f | sort`
  - `npx tsc --noEmit --skipLibCheck --moduleResolution nodenext --module nodenext --target es2022 --lib es2022,dom --types node src/auggie-discovery.ts src/second-model-opus.ts`
  - `python3 -m py_compile /Users/subhajlimanond/dev/ma-code/packages/pi-g-skills/extensions/bin/auggie-discovery-bridge.py`
  - explicit `--skill` discovery via Pi RPC
  - direct extension runtime probes
  - disposable `pi install -l ...` validation in temp dirs

### Findings
CRITICAL
- none

HIGH
- none

MEDIUM
- Installing this package into an environment that still loads same-name `g-*` skills from another source leaves the package skills shadowed, because Pi keeps the first skill found for a duplicated name.
  - Evidence: disposable package-install `get_commands` returned `skill:g-planning`, `skill:g-coding`, `skill:g-check`, and `skill:g-review` from `~/.codex/skills`, while the package extension command loaded from `packages/pi-g-skills`.
  - Why it matters: the package can appear installed but not actually provide the intended skill behavior.
  - Fix direction: disable the older conflicting skill source before relying on this package; this requirement is now documented in `packages/pi-g-skills/README.md`.
  - Validation still needed: after disabling the old source, rerun Pi RPC `get_commands` and confirm the `g-*` skills point at package paths.

LOW
- none

### Open Questions / Assumptions
- Assumed that “Claude Opus 4.6 only” permits provider variants of the same model family, though the implementation prefers exact `anthropic/claude-opus-4-6` first.
- Assumed that Pi-style logs/index should be guidance in the skills and docs, not a new runtime persistence layer.

### Recommended Tests / Validation
- Re-run one live `/skill:g-coding` smoke test in the global environment if desired.
- Re-run `auggie_discover` when Auggie credits are available to validate the success path.
- Re-run `second_model_plan` when Anthropic Opus 4.6 access is available to validate the success path.

### Rollout Notes
- This package is now active in the global Pi config.
- Older same-name `g-*` skill loading from `~/.codex/skills` was switched off in the global Pi settings.
- No repo-local harness runtime state was added.

### Review Verdict
- no_required_fixes
