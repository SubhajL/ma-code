# Planning Log — g-skill-auto-route

- Date: 2026-04-19
- Scope: Add repo-local Pi extension support for Phase 1 input-hook auto-routing to `g-*` skills and Phase 2 `before_agent_start` reinforcement.
- Status: ready
- Related coding log: `logs/coding/2026-04-19_g-skill-auto-route.md`

## Discovery Path
- Auggie attempt: timed out
- Fallback used:
  - `read` on `logs/CURRENT.md`, `AGENTS.md`, `.pi/settings.json`
  - Pi docs: `docs/extensions.md`
  - Pi examples: `examples/extensions/input-transform.ts`, `examples/extensions/pirate.ts`, `examples/extensions/plan-mode/index.ts`
  - skill files: `packages/pi-g-skills/skills/g-planning/SKILL.md`, `g-coding/SKILL.md`, `g-check/SKILL.md`, `g-review/SKILL.md`

## Goal
- Implement a minimal repo-local extension that:
  - routes matching user input to explicit `/skill:g-planning`, `/skill:g-coding`, `/skill:g-check`, or `/skill:g-review`
  - reinforces the selected skill per turn in `before_agent_start`
  - keeps review ambiguity bounded via explicit precedence rules

## Non-Goals
- no runtime safety changes to `safe-bash.ts` or `till-done.ts`
- no queue/orchestration/runtime-state changes
- no packaging/global install changes
- no UI widgets or persistent telemetry subsystem

## Assumptions
- installed `g-*` skills remain discoverable either from current Pi config or explicit `--skill` validation paths
- placing a new extension under `.pi/agent/extensions/` is sufficient because `.pi/settings.json` already points at `agent/extensions`
- hidden custom context messages (`display: false`) are acceptable for per-turn reinforcement

## Cross-Model Check
- attempted `second_model_plan`
- result: explicit fallback to main/current model because Anthropic credits are unavailable in this environment

## Plan Draft A
- Add one new extension file: `.pi/agent/extensions/g-skill-auto-route.ts`
- In `input`:
  - skip extension-injected input
  - preserve explicit `/skill:*` and other slash commands
  - detect explicit `g-*` mentions and keyword phrases
  - apply precedence:
    1. `g-review` phrases
    2. `g-check` phrases
    3. `g-planning` phrases
    4. `g-coding` phrases
  - transform matching raw input into `/skill:<name> <original text>`
  - record pending route metadata for the next `before_agent_start`
- In `before_agent_start`:
  - if a route was selected for the current prompt, inject:
    - a concise hidden custom message with the selected skill and intent reason
    - a short system-prompt append telling the agent to follow that skill for the turn
- Validate with:
  - RED: probe fails before extension file exists
  - GREEN: live Pi probes for at least planning and coding routing
  - readback/wiring check that file placement matches `.pi/settings.json`

## Plan Draft B
- Add one new extension file with `input` transform only
- Do not use hidden message injection
- Use only system-prompt append in `before_agent_start`
- Validate with a single live routing probe and file readback

## Unified Plan
- Use Draft A structure, but keep the reinforcement text compact
- Implement one extension file with:
  - input classification + transform
  - hidden message + system-prompt reinforcement
- Keep precedence explicit to reduce `g-check` vs `g-review` ambiguity
- Run a bounded RED/GREEN sequence and then a skeptical review

## Files to Modify
- `logs/CURRENT.md`
- `logs/coding/2026-04-19_g-skill-auto-route.md`

## New Files
- `.pi/agent/extensions/g-skill-auto-route.ts`
- `reports/planning/2026-04-19_g-skill-auto-route-plan.md`
- `logs/coding/2026-04-19_g-skill-auto-route.md`

## TDD Sequence
- 1. RED: run Pi with `-e ./.pi/agent/extensions/g-skill-auto-route.ts` before the file exists; confirm it fails because the extension is missing
- 2. Create the smallest extension with routing tables and pending-skill tracking
- 3. Run live routing probes and confirm the transformed prompt expands to the expected skill headers
- 4. Refactor keyword handling minimally if a route is too broad or ambiguous
- 5. Re-run the same probes and a skeptical review readback

## Test Coverage
- RED existence failure for the new extension file
- live routing probe for `g-planning`
- live routing probe for `g-coding`
- live review-path probe for `g-review` or `g-check` precedence
- readback validation of `.pi/settings.json` wiring and the new extension file

## Acceptance Criteria
- a new repo-local extension exists under `.pi/agent/extensions/`
- matching raw user input is transformed to explicit `/skill:g-*` commands before skill expansion
- the extension preserves explicit `/skill:*` invocations and does not rewrite unrelated slash commands
- `before_agent_start` reinforces the selected skill for that turn with hidden context and system-prompt guidance
- precedence handles `g-review` ahead of generic `review` routing so architecture/codebase review is not misrouted
- live Pi probes show the expected skill output headers for at least planning and coding routes

## Wiring Checks
| Component | Entry Point | Registration Location | How to Verify |
|---|---|---|---|
| `g-skill-auto-route.ts` | `input` event | `.pi/agent/extensions/` via `.pi/settings.json -> extensions: ["agent/extensions"]` | read back `.pi/settings.json`; run Pi with `-e` and observe routed skill output |
| `g-skill-auto-route.ts` | `before_agent_start` event | same extension file | read back code; confirm hidden message + systemPrompt append are returned when a skill is selected |

## Validation
- RED command for missing extension file
- GREEN runtime probes with explicit `--skill` paths for deterministic skill availability
- grep/readback of changed files
- skeptical `g-check`-style review of the bounded diff

## Risks
- generic keyword matching can still misroute edge cases; precedence reduces but does not eliminate ambiguity
- hidden reinforcement context is not as directly observable as visible output; runtime proof will be mostly behavioral plus readback
- global/package skill availability drift could affect validation without explicit `--skill` paths

## Pi Log Update
- planning log: `reports/planning/2026-04-19_g-skill-auto-route-plan.md`
- coding log: `logs/coding/2026-04-19_g-skill-auto-route.md`
