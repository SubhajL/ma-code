# Planning Log — g-skill-usage-rules

- Date: 2026-04-19
- Scope: Make `g-planning`, `g-coding`, `g-check`, and `g-review` usage rules repo-persistent across sessions in repo instructions.
- Status: ready
- Related coding log: `logs/coding/2026-04-19_g-skill-usage-rules.md`

## Goal
- Ensure future sessions prefer the installed `g-*` skills for matching planning, implementation, review, and system-review tasks.

## Scope
- Update repo-persistent instructions only.
- Do not change runtime extensions, routing logic, or packaging.

## Files to Create or Edit
- `AGENTS.md`
- `.pi/SYSTEM.md`
- `logs/CURRENT.md`
- `reports/planning/2026-04-19_g-skill-usage-rules-plan.md`
- `logs/coding/2026-04-19_g-skill-usage-rules.md`

## Why Each File Exists
- `AGENTS.md` should define repo workflow rules that persist across sessions.
- `.pi/SYSTEM.md` should reinforce runtime preference for the installed `g-*` skills.
- `logs/CURRENT.md` should point at the active bounded log pair.
- planning/coding logs should preserve evidence for this bounded change.

## What Logic Belongs There
- `AGENTS.md`: exact task-to-skill mapping and read-the-skill-first rule.
- `.pi/SYSTEM.md`: prefer installed `g-*` skills before inventing ad hoc workflows.
- logs: scope, evidence, risks, and outcome.

## What Should Not Go There
- no queue/runtime behavior changes
- no packaging changes
- no new policy unrelated to skill usage

## Dependencies
- existing installed `packages/pi-g-skills`
- existing repo logging convention

## Acceptance Criteria
- `AGENTS.md` explicitly maps planning → `g-planning`, implementation/debugging → `g-coding`, review/verification → `g-check`, architecture/system review → `g-review`.
- `AGENTS.md` tells the agent to read the relevant `SKILL.md` before proceeding when a task matches.
- `.pi/SYSTEM.md` reinforces preference for installed `g-*` skills and explicit loading on matching tasks.
- `logs/CURRENT.md` points to the new bounded planning/coding log pair.
- Readback validation confirms the new rules are present.

## Likely Failure Modes
- rules are too vague and do not clearly map task types to skills
- instructions duplicate too much package detail instead of giving a short durable rule
- active log pointer is left on an unrelated workstream

## Validation Plan
- read back `AGENTS.md`, `.pi/SYSTEM.md`, and `logs/CURRENT.md`
- grep for `g-planning`, `g-coding`, `g-check`, and `g-review`
- confirm the new log files exist and are referenced

## Recommended Next Step
- Implement the repo-instruction updates and validate them with readback.
