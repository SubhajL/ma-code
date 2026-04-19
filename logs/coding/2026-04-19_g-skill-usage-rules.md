# Coding Log — g-skill-usage-rules

- Date: 2026-04-19
- Scope: Make `g-*` skill usage rules persistent across sessions via repo instructions.
- Status: complete
- Branch: ma-code/logs-planning-20260417
- Related planning log: `reports/planning/2026-04-19_g-skill-usage-rules-plan.md`

## Task Group
- add explicit repo rules for when to use `g-planning`, `g-coding`, `g-check`, and `g-review`
- reinforce the same preference in `.pi/SYSTEM.md`
- move `logs/CURRENT.md` to this bounded workstream

## Files Investigated
- `packages/pi-g-skills/skills/g-coding/SKILL.md`
- `packages/pi-g-skills/skills/g-check/SKILL.md`
- `AGENTS.md`
- `.pi/SYSTEM.md`
- `logs/CURRENT.md`
- `logs/README.md`

## Files Changed
- `AGENTS.md`
- `.pi/SYSTEM.md`
- `logs/CURRENT.md`
- `reports/planning/2026-04-19_g-skill-usage-rules-plan.md`
- `logs/coding/2026-04-19_g-skill-usage-rules.md`

## Runtime / Validation Evidence
- RED:
  - none produced
  - reason: this is a repo-instruction and log-wiring change, not a behavior change with an existing failing test surface
- GREEN:
  - readback validation of `AGENTS.md`
  - readback validation of `.pi/SYSTEM.md`
  - readback validation of `logs/CURRENT.md`
  - exact grep validation:
    - `cd /Users/subhajlimanond/dev/ma-code && rg -n "g-planning|g-coding|g-check|g-review|/skill:" AGENTS.md .pi/SYSTEM.md logs/CURRENT.md`
  - observed results included:
    - `AGENTS.md` task-to-skill mapping for `g-planning`, `g-coding`, `g-check`, `g-review`
    - `AGENTS.md` explicit `/skill:<name>` guidance
    - `.pi/SYSTEM.md` skill preference section with explicit `/skill:g-*` guidance
    - `logs/CURRENT.md` pointing to the new bounded planning/coding log pair

## Key Findings
- skill availability alone is not enough to make workflow use durable across sessions
- repo-persistent instruction layers need to state both:
  - which skill maps to which task type
  - when explicit `/skill:*` loading is preferred over auto-match
- a small bounded log pair keeps this instruction-wiring change auditable without mixing it into unrelated harness/package work

## Decisions Made
- keep the change limited to repo instructions and log pointers
- put task-to-skill mapping in `AGENTS.md`
- reinforce runtime preference and explicit loading guidance in `.pi/SYSTEM.md`
- leave runtime extensions, routing logic, and packaging untouched

## Known Risks
- Pi may still not load full skill bodies automatically on every matching task; explicit `/skill:name` invocation remains the strongest guarantee
- these rules improve default behavior and persistence, but they do not replace explicit operator prompting when guaranteed skill loading is required

## Current Outcome
- `AGENTS.md` now explicitly maps planning/design to `g-planning`, implementation/debugging to `g-coding`, review/verification to `g-check`, and architecture/drift review to `g-review`
- `.pi/SYSTEM.md` now prefers installed `g-*` skills and recommends explicit `/skill:g-*` loading when ambiguity exists
- `logs/CURRENT.md` now points at this bounded workstream
- the rule is now repo-persistent instead of depending on chat memory alone

## Next Action
- for important work in future sessions, still prefer explicit `/skill:g-planning`, `/skill:g-coding`, `/skill:g-check`, or `/skill:g-review` when guaranteed loading matters

## Implementation Summary (2026-04-19 07:45:00 +0700)

### Goal
- Make `g-*` skill usage rules durable across sessions through repo-loaded instructions.

### What changed
- Added a `Skill workflow rules` section to `AGENTS.md`.
- Added a `Skill preference` section to `.pi/SYSTEM.md`.
- Created a new bounded planning/coding log pair and pointed `logs/CURRENT.md` at it.

### TDD evidence
- RED:
  - none produced
  - reason: no existing failing test surface applied to this docs/instruction-wiring change
- GREEN:
  - readback and grep validation confirmed the new rules are present in the intended files

### Wiring verification evidence
- Repo instruction wiring:
  - `AGENTS.md` is repo-persistent and now contains the exact task-to-skill mapping
- Pi runtime guidance wiring:
  - `.pi/SYSTEM.md` now contains the matching skill preference rules
- Active log pointer wiring:
  - `logs/CURRENT.md` now points at this bounded planning/coding log pair

### Behavior / risk notes
- The repo now encodes default `g-*` usage guidance across sessions.
- Explicit `/skill:g-*` remains the highest-confidence path when auto-match ambiguity would be risky.

## Review (2026-04-19 07:46:00 +0700) - working-tree

### Reviewed
- Repo: `/Users/subhajlimanond/dev/ma-code`
- Branch: `ma-code/logs-planning-20260417`
- Scope: `working-tree`
- Commands Run:
  - `cd /Users/subhajlimanond/dev/ma-code && rg -n "g-planning|g-coding|g-check|g-review|/skill:" AGENTS.md .pi/SYSTEM.md logs/CURRENT.md`
  - readback of `AGENTS.md`
  - readback of `.pi/SYSTEM.md`
  - readback of `logs/CURRENT.md`

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
- Assumed the right persistence target is repo instructions, not additional runtime extension enforcement.
- Assumed concise task-to-skill mapping is preferable to embedding package-specific path details in repo rules.

### Recommended Tests / Validation
- Open a fresh Pi session in this repo and verify the new instructions appear in loaded repo guidance.
- For a future high-value task, explicitly invoke `/skill:g-planning` or `/skill:g-coding` once to confirm the live environment resolves the intended installed skill.

### Rollout Notes
- This change is safe and repo-local.
- No runtime extension behavior, task state, or package installation was modified.

### Review Verdict
- no_required_fixes
