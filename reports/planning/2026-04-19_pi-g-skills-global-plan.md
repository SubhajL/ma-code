# Planning Log — pi-g-skills-global

- Date: 2026-04-19
- Scope: Build a reusable Pi package that ports Codex global skills into Pi with the original `g-*` names, Pi-style logs/index, Auggie-first discovery fallback, Opus-4.6-only second-model planning, and includes `g-review`.
- Status: ready
- Related coding log: `logs/coding/2026-04-19_pi-g-skills-global.md`

## Discovery Path
- Auggie semantic search unavailable in this session; plan is based on direct file inspection + exact-string searches.
- Inspected files:
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

## Goal
- Produce a Pi-native reusable package that preserves the recognizable Codex workflows of `g-planning`, `g-coding`, `g-check`, and `g-review`.
- Preserve TDD, RED/GREEN evidence, wiring verification, severity-ordered review, and architecture drift analysis.
- Adapt persistence and discovery conventions to Pi-native behavior, especially `logs/CURRENT.md`, `logs/coding/`, and `reports/planning/` instead of `.codex/coding-log.current`.

## Non-Goals
- Do not build repo-local multi-agent harness orchestration.
- Do not add queue/task runtime controls, worker routing, or Graphite workflows.
- Do not require Taskmaster or Codex-specific persistence paths.
- Do not require a second-model provider other than Claude Opus 4.6.

## Plan Draft A — Full packaged port with small runtime helpers
### Overview
- Create one reusable Pi package under `packages/pi-g-skills`.
- Port four skills with Pi-native logging/index guidance and add two runtime extensions for Auggie discovery and second-model planning.
- Keep the package self-contained with bundled docs that explain preserved vs adapted behavior.

### Files to Create or Edit
- `packages/pi-g-skills/package.json` — Pi package manifest and peer dependency declarations.
- `packages/pi-g-skills/README.md` — install/use guide for global Pi usage.
- `packages/pi-g-skills/skills/g-planning/SKILL.md` — planning workflow with two-draft synthesis, Pi-style logs, TDD sequence, wiring verification.
- `packages/pi-g-skills/skills/g-coding/SKILL.md` — strict TDD implementation workflow, RED/GREEN evidence, flakiness checks, QCHECK, and `g-check` handoff.
- `packages/pi-g-skills/skills/g-check/SKILL.md` — skeptical review workflow, severity ordering, Pi-style log append rules.
- `packages/pi-g-skills/skills/g-review/SKILL.md` — system review workflow with as-is pipeline, drift matrix, tactical/strategic roadmap.
- `packages/pi-g-skills/extensions/auggie-discovery.ts` — Pi tool `auggie_discover` with bounded fallback.
- `packages/pi-g-skills/extensions/second-model-opus.ts` — Pi tool `second_model_plan` restricted to Claude Opus 4.6 and explicit fallback to the main model.
- `packages/pi-g-skills/extensions/lib/process-utils.ts` — shared bounded subprocess helper.
- `packages/pi-g-skills/extensions/bin/auggie-discovery-bridge.py` — one-shot Auggie CLI bridge.
- `packages/pi-g-skills/docs/pi-log-convention.md` — Pi log/index mapping for the port.
- `packages/pi-g-skills/docs/porting-matrix.md` — preserved/adapted/dropped behavior matrix.
- `logs/CURRENT.md` — update active planning/coding log pointers.
- `logs/coding/2026-04-19_pi-g-skills-global.md` — evidence log for this bounded task.

### TDD Sequence
1. Add package skeleton and write the skill/extension contracts first in docs + skill files.
2. Run package-loading or extension-loading validation to confirm failures or missing behavior for the right reason.
3. Implement the smallest runtime helpers (`process-utils`, Auggie extension, second-model extension).
4. Run targeted validation commands until the package loads cleanly.
5. Refactor wording/docs minimally so the package is coherent and Pi-native.

### Function / Module Outline
- `getAuggieConfig()` — resolve HTTP/command/packaged bridge mode with short timeout defaults.
- `callAuggieCommand()` — run the packaged bridge with bounded subprocess control.
- `orderedSecondModelCandidates()` — choose only Opus 4.6-compatible second-model candidates.
- `runSecondModelPlan()` — execute a read-only Pi subprocess for a second planning pass.
- `formatFallback()` — preserve the primary plan and explain explicit fallback to the main model.

### Expected Tests / Validation
- Load `auggie-discovery.ts` directly via Pi; tool should respond with either semantic results or explicit fallback.
- Load `second-model-opus.ts` directly via Pi; tool should either use Opus 4.6 or return explicit fallback.
- Verify skill discovery by loading the package skills through Pi CLI.

### Trade-offs
- More files, but clearer separation of package/runtime/docs.
- Better long-term maintainability for a reusable global package.

## Plan Draft B — Minimal package with skills-only heavy lifting
### Overview
- Create the same package but keep most behavior in skill text and only ship the bare minimum runtime code.
- Use fewer docs and embed most guidance directly in `SKILL.md` files.

### Files to Create or Edit
- Same core files as Draft A, but omit `docs/porting-matrix.md` and keep `docs/pi-log-convention.md` optional.
- Shorter READMEs and more inline documentation in skill files.

### TDD Sequence
1. Create minimal package manifest and skills.
2. Load skills directly to verify command discovery.
3. Add only the two extensions with minimal helper code.
4. Validate extension loading and fallback behavior.

### Trade-offs
- Fewer files and faster initial implementation.
- Harder to maintain or explain later because important adaptation rules live only inside the skill files.

## Comparative Analysis & Synthesis
### Strengths
- Draft A is clearer for long-term reuse, packaging, and future publication.
- Draft B is smaller and faster to ship.

### Gaps
- Draft B risks hiding important Pi-vs-Codex adaptation rules.
- Draft A adds more documentation work, but that is acceptable for a reusable global package.

### Unified Choice
- Use Draft A structure, but keep the docs compact.
- Put the most important operational rules directly in the skill files and use docs only for supporting detail.

## Unified Execution Plan
## Scope
- Build `packages/pi-g-skills` as a standalone Pi package.
- Port `g-planning`, `g-coding`, `g-check`, and `g-review` with Pi-native logging/index rules.
- Reuse the existing repo’s Pi-style coding log/index conventions for this task and encode that convention into the package docs/skill behavior.

## Files to Create or Edit
- `packages/pi-g-skills/package.json`
- `packages/pi-g-skills/README.md`
- `packages/pi-g-skills/skills/g-planning/SKILL.md`
- `packages/pi-g-skills/skills/g-coding/SKILL.md`
- `packages/pi-g-skills/skills/g-check/SKILL.md`
- `packages/pi-g-skills/skills/g-review/SKILL.md`
- `packages/pi-g-skills/extensions/auggie-discovery.ts`
- `packages/pi-g-skills/extensions/second-model-opus.ts`
- `packages/pi-g-skills/extensions/lib/process-utils.ts`
- `packages/pi-g-skills/extensions/bin/auggie-discovery-bridge.py`
- `packages/pi-g-skills/docs/pi-log-convention.md`
- `packages/pi-g-skills/docs/porting-matrix.md`
- `logs/CURRENT.md`
- `logs/coding/2026-04-19_pi-g-skills-global.md`

## Why Each File Exists
- `package.json` wires the package into Pi package discovery.
- `README.md` explains install and usage as a global package.
- The four skill files preserve Codex workflows under the same names.
- `auggie-discovery.ts` and the bridge preserve Auggie-first bounded discovery.
- `second-model-opus.ts` preserves the second-model planning behavior with the user’s Opus-only restriction.
- `process-utils.ts` provides consistent timeout/abort behavior for subprocess-backed tools.
- `pi-log-convention.md` maps `.codex/coding-log.current` behavior to Pi’s `logs/CURRENT.md` convention.
- `porting-matrix.md` documents what was preserved, adapted, or intentionally dropped.

## What Logic Belongs There
- Skill files: process, discipline, acceptance criteria, TDD, review behavior.
- Extensions: actual runtime tool behavior that a skill alone cannot enforce reliably.
- Docs: compact explanation of the Pi-native adaptation layer.

## What Should Not Go There
- No queue/task runtime logic.
- No repo-local harness routing.
- No Graphite or Taskmaster workflows.
- No duplicate coding-log persistence system.

## Dependencies
- Pi package manifest support.
- Pi skill discovery.
- Pi extension loading.
- Python 3 for the Auggie bridge helper.
- Optional local `auggie` CLI for semantic discovery.

## Acceptance Criteria
- The package is structurally valid as a Pi package and self-contained under `packages/pi-g-skills`.
- `g-planning`, `g-coding`, `g-check`, and `g-review` exist as Pi skills with preserved `g-*` names.
- `g-planning` and `g-coding` explicitly preserve TDD, including RED/GREEN evidence and wiring verification.
- Package guidance uses Pi-style logs/index (`logs/CURRENT.md`, `logs/coding/`, `reports/planning/`) instead of `.codex/coding-log.current`.
- `auggie_discover` exists and returns explicit fallback guidance when Auggie is unavailable.
- `second_model_plan` restricts model 2 to Claude Opus 4.6 and falls back explicitly to the main model otherwise.
- No file in the package depends on repo-local multi-agent harness orchestration.

## Likely Failure Modes
- Pi extension loading fails due to path resolution inside a packaged install.
- Skill descriptions are too vague for reliable discovery.
- Second-model tool silently broadens beyond Opus 4.6.
- Logging guidance accidentally preserves Codex-specific `.codex` paths.
- Auggie tool hangs instead of failing fast.

## Validation Plan
- Use Pi CLI to load each extension directly and inspect the tool output for fallback semantics.
- Use Pi CLI skill loading to confirm the four skills are valid and discoverable.
- Read back all package files to confirm they encode Pi-native logs/index, TDD, wiring verification, and review behavior.
- Perform a skeptical `g-check`-style review on the resulting package files and record findings in the coding log.

## Wiring Verification
| Component | Entry Point | Registration Location | Schema/Table |
|---|---|---|---|
| `package.json` | `pi install <path>` or Pi package discovery | `pi` manifest with `skills` + `extensions` paths | N/A |
| `skills/g-planning/SKILL.md` | `/skill:g-planning` or automatic skill loading | Pi skill discovery from package `skills/` | N/A |
| `skills/g-coding/SKILL.md` | `/skill:g-coding` or automatic skill loading | Pi skill discovery from package `skills/` | N/A |
| `skills/g-check/SKILL.md` | `/skill:g-check` or automatic skill loading | Pi skill discovery from package `skills/` | N/A |
| `skills/g-review/SKILL.md` | `/skill:g-review` or automatic skill loading | Pi skill discovery from package `skills/` | N/A |
| `extensions/auggie-discovery.ts` | Model calls custom tool `auggie_discover` | Pi extension loader via package `extensions/` | N/A |
| `extensions/second-model-opus.ts` | Model calls custom tool `second_model_plan` | Pi extension loader via package `extensions/` | N/A |
| `extensions/bin/auggie-discovery-bridge.py` | Spawned by `auggie-discovery.ts` in command mode | Resolved relative to packaged extension path | N/A |

## Recommended Next Step
- Implement the package in one bounded pass, then run targeted Pi CLI validation and a skeptical review before calling it done.
