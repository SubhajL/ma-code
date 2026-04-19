# Coding Log — g-skill-auto-route

- Date: 2026-04-19
- Scope: Implement Phase 1 input-hook `g-*` skill auto-routing and Phase 2 `before_agent_start` reinforcement in a repo-local Pi extension.
- Status: complete
- Branch: ma-code/logs-planning-20260417
- Related planning log: `reports/planning/2026-04-19_g-skill-auto-route-plan.md`

## Task Group
- add a repo-local extension for `g-*` skill auto-routing
- add per-turn reinforcement in `before_agent_start`
- validate with bounded live Pi probes

## Files Investigated
- `AGENTS.md`
- `.pi/settings.json`
- `logs/CURRENT.md`
- Pi docs: `docs/extensions.md`
- Pi examples:
  - `examples/extensions/input-transform.ts`
  - `examples/extensions/pirate.ts`
  - `examples/extensions/plan-mode/index.ts`
- skill files:
  - `packages/pi-g-skills/skills/g-planning/SKILL.md`
  - `packages/pi-g-skills/skills/g-coding/SKILL.md`
  - `packages/pi-g-skills/skills/g-check/SKILL.md`
  - `packages/pi-g-skills/skills/g-review/SKILL.md`

## Files Changed
- `.pi/agent/extensions/g-skill-auto-route.ts`
- `logs/CURRENT.md`
- `reports/planning/2026-04-19_g-skill-auto-route-plan.md`
- `logs/coding/2026-04-19_g-skill-auto-route.md`

## Runtime / Validation Evidence
- RED:
  - `cd /Users/subhajlimanond/dev/ma-code && pi --no-session --no-extensions -e ./.pi/agent/extensions/g-skill-auto-route.ts --mode json "Reply with exactly OK."`
  - result: failed before implementation with:
    - `Extension path does not exist: /Users/subhajlimanond/dev/ma-code/.pi/agent/extensions/g-skill-auto-route.ts`
  - key reason: the new extension had not been created yet
- GREEN:
  - compile check:
    - isolated temp-dir `npm install` + `npx tsc --noEmit --skipLibCheck --moduleResolution nodenext --module nodenext --target es2022 --lib es2022,dom --types node src/g-skill-auto-route.ts`
    - result: success with no TypeScript errors
  - live routing probe — planning:
    - `cd /Users/subhajlimanond/dev/ma-code && pi --no-session --no-extensions -e ./.pi/agent/extensions/g-skill-auto-route.ts --no-skills --skill /Users/subhajlimanond/dev/ma-code/packages/pi-g-skills/skills/g-planning --skill /Users/subhajlimanond/dev/ma-code/packages/pi-g-skills/skills/g-coding --skill /Users/subhajlimanond/dev/ma-code/packages/pi-g-skills/skills/g-check --skill /Users/subhajlimanond/dev/ma-code/packages/pi-g-skills/skills/g-review --print "plan a docs-only clarification task and return only the required top-level section headers."`
    - observed output: exact `g-planning` headers beginning with:
      - `## Discovery Path`
      - `## Goal`
      - `## Non-Goals`
      - `## Assumptions`
  - live routing probe — coding:
    - `cd /Users/subhajlimanond/dev/ma-code && pi --no-session --no-extensions -e ./.pi/agent/extensions/g-skill-auto-route.ts --no-skills --skill /Users/subhajlimanond/dev/ma-code/packages/pi-g-skills/skills/g-planning --skill /Users/subhajlimanond/dev/ma-code/packages/pi-g-skills/skills/g-coding --skill /Users/subhajlimanond/dev/ma-code/packages/pi-g-skills/skills/g-check --skill /Users/subhajlimanond/dev/ma-code/packages/pi-g-skills/skills/g-review --print "implement a docs-only clarification task and return only the required top-level section headers exactly."`
    - observed output: exact `g-coding` headers:
      - `## Discovery Path`
      - `## Goal`
      - `## TDD Plan`
      - `## Changes`
      - `## RED Evidence`
      - `## GREEN Evidence`
      - `## Wiring Verification`
      - `## Quality Gates`
      - `## QCHECK`
      - `## g-check Handoff`
      - `## Risks / Follow-ups`
      - `## Pi Log Update`
  - live precedence probe — architecture review:
    - `cd /Users/subhajlimanond/dev/ma-code && pi --no-session --no-extensions -e ./.pi/agent/extensions/g-skill-auto-route.ts --no-skills --skill /Users/subhajlimanond/dev/ma-code/packages/pi-g-skills/skills/g-planning --skill /Users/subhajlimanond/dev/ma-code/packages/pi-g-skills/skills/g-coding --skill /Users/subhajlimanond/dev/ma-code/packages/pi-g-skills/skills/g-check --skill /Users/subhajlimanond/dev/ma-code/packages/pi-g-skills/skills/g-review --print "review architecture and return only the required top-level section headers."`
    - observed output began with exact `g-review` headers:
      - `## Discovery Path`
      - `## Reviewed Scope`
      - `## As-Is Pipeline Diagram`
      - `## High-Level Assessment`
    - note: one rerun later timed out after printing headers, but the routing result was still visible and matched `g-review`

## Key Findings
- Pi `input` is the correct hook for routing because it runs before skill expansion
- Pi `before_agent_start` is the correct hook for per-turn reinforcement after routing decisions are made
- hidden custom messages with `display: false` are a supported pattern for non-user-visible context injection
- explicit `--skill` validation paths make the runtime probes deterministic even if global skill discovery changes later

## Decisions Made
- implement one bounded extension file: `.pi/agent/extensions/g-skill-auto-route.ts`
- use explicit precedence:
  1. `g-review`
  2. `g-check`
  3. `g-planning`
  4. `g-coding`
- preserve explicit `/skill:g-*` invocations instead of rewriting them
- reinforce selected skill in two ways:
  - hidden custom message
  - appended per-turn system-prompt guidance
- use a FIFO queue of pending routes instead of one global slot so queued prompts do not overwrite one another

## Known Risks
- generic keyword routing is heuristic and may misclassify edge cases
- bare `review` remains inherently ambiguous; precedence reduces but does not eliminate that ambiguity
- if future extensions add `input` handlers that fully handle prompts after this extension runs, the pending-route queue could require a tighter integration test or ordering rule
- hidden `before_agent_start` reinforcement is structurally wired and behaviorally implied, but not directly user-visible in normal CLI output

## Current Outcome
- Phase 1 is implemented:
  - matching user input is transformed into explicit `/skill:g-*` commands before skill expansion
- Phase 2 is implemented:
  - selected skill is reinforced per turn in `before_agent_start` through hidden context and system-prompt guidance
- active logs now point at this bounded workstream

## Next Action
- if desired, add a small dedicated validator script later for routing cases like:
  - generic `review`
  - explicit `/skill:g-*`
  - multiple queued prompts in one session

## Implementation Summary (2026-04-19 08:05:00 +0700)

### Goal
- Add a repo-local extension that auto-routes matching prompts to `g-*` skills and reinforces the selected skill per turn.

### What changed
- Added `.pi/agent/extensions/g-skill-auto-route.ts`.
- Added keyword/phrase routing for `g-planning`, `g-coding`, `g-check`, and `g-review`.
- Added `before_agent_start` reinforcement via hidden custom message plus system-prompt append.
- Added FIFO pending-route handling so queued prompts remain ordered correctly.
- Created a new bounded planning/coding log pair and updated `logs/CURRENT.md`.

### TDD evidence
- RED:
  - extension load failed because the target file did not yet exist
- GREEN:
  - TypeScript compile check passed
  - live Pi probes produced `g-planning`, `g-coding`, and `g-review`-shaped outputs from raw matching prompts

### Wiring verification evidence
- Extension registration:
  - `.pi/settings.json` already includes `"extensions": ["agent/extensions"]`
  - new file was added under `.pi/agent/extensions/`
- Runtime routing:
  - live Pi probes with `-e ./.pi/agent/extensions/g-skill-auto-route.ts` routed raw prompts into the expected skill outputs
- Reinforcement hook:
  - `.pi/agent/extensions/g-skill-auto-route.ts` returns a hidden custom message and appended `systemPrompt` in `before_agent_start` when a route is present

### Behavior / risk notes
- architecture/codebase review intent is routed before generic review to reduce `g-check`/`g-review` collisions
- explicit `/skill:g-*` commands are preserved and still get reinforcement metadata

## Review (2026-04-19 08:06:00 +0700) - working-tree

### Reviewed
- Repo: `/Users/subhajlimanond/dev/ma-code`
- Branch: `ma-code/logs-planning-20260417`
- Scope: `working-tree`
- Commands Run:
  - `git status --short .pi/agent/extensions/g-skill-auto-route.ts logs/CURRENT.md reports/planning/2026-04-19_g-skill-auto-route-plan.md logs/coding/2026-04-19_g-skill-auto-route.md`
  - readback of `.pi/agent/extensions/g-skill-auto-route.ts`
  - live Pi routing probes for planning, coding, and architecture review
  - isolated TypeScript compile check

### Findings
CRITICAL
- none

HIGH
- none

MEDIUM
- none

LOW
- Future additional `input` handlers that fully handle prompts after this extension runs could require explicit ordering or a small integration test for the pending-route queue.
  - Why it matters: queued route metadata assumes one `before_agent_start` for each accepted prompt in order.
  - Fix direction: if new input-handling extensions are added later, add a routing integration test or document extension ordering expectations.
  - Validation still needed: a future multi-extension routing test if the extension stack grows.

### Open Questions / Assumptions
- Assumed hidden reinforcement is preferable to visible user-facing route banners.
- Assumed architecture/codebase review should outrank generic `review` for routing safety.

### Recommended Tests / Validation
- Add a future routing validator for:
  - generic `review`
  - explicit `/skill:g-*`
  - queued follow-up prompts
- Re-run the current live probes after any future changes to keyword sets or prompt-routing extensions.

### Rollout Notes
- This is a repo-local extension only.
- No runtime safety/task-discipline extension behavior was changed.
- No package/global settings were modified.

### Review Verdict
- no_required_fixes

## Review (2026-04-19 10:15:00 +0700) - architecture header-only response

### Reviewed
- Repo: `/Users/subhajlimanond/dev/ma-code`
- Branch: `ma-code/logs-planning-20260417`
- Scope: top-level architecture review request with explicit output constraint
- User constraint: return only the required `g-review` top-level section headers exactly

### Findings
- No additional architecture evidence was collected in this turn beyond the already-read intent docs:
  - `AGENTS.md`
  - `README.md`
  - `SYSTEM.md`
  - `logs/CURRENT.md`
- Response was intentionally constrained to header-only output to match the user request exactly.

### Risks / Gaps
- Because the user explicitly requested headers only, this turn does not provide a substantive drift analysis or recommendations.
- A full `g-review` deliverable would require additional repo inspection and evidence-backed content.

### Review Verdict
- header_only_response_per_user_request

## Keyword Alignment Update (2026-04-19 10:20:00 +0700)

### Goal
- Align the extension keyword set exactly to the user-approved final keyword list.

### What changed
- Removed bare `review` from the `g-check` matcher.
- Removed `change code` from the `g-coding` matcher.
- Left the approved final keyword phrases unchanged for `g-planning`, `g-coding`, `g-check`, and `g-review`.

### Validation
- grep validation:
  - `cd /Users/subhajlimanond/dev/ma-code && rg -n '\\breview\\b|change\\s+code|review\\s+changes|review\\s+architecture|g-check|g-review' .pi/agent/extensions/g-skill-auto-route.ts`
  - observed result: no bare `\breview\b` matcher and no `change\s+code` matcher remain
- compile validation:
  - isolated temp-dir `npm install` + `npx tsc --noEmit --skipLibCheck --moduleResolution nodenext --module nodenext --target es2022 --lib es2022,dom --types node src/g-skill-auto-route.ts`
  - result: success with no TypeScript errors
- live probe:
  - `review architecture and return only the required top-level section headers exactly.` still produced `g-review`-shaped output headers
- note:
  - `review changes` probe timed out twice in this environment, so exact runtime proof for that phrase remains weaker than grep-level proof for the matcher list itself

### Risks
- runtime proof for `review changes` remains partially inferred from the exact matcher list because the live probe timed out in this environment
- further routing validation would benefit from a small dedicated validator script later
