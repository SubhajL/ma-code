# Planning Log — skill-graphify-guidance

- Date: 2026-05-04
- Scope: Tighten `g-planning` and `g-coding` discovery guidance so Graphify usage aligns more explicitly with the repo's local-vs-broad discovery policy.
- Status: ready
- Related coding log: `logs/coding/2026-05-04_skill-graphify-guidance.md`

## Goal
- Clarify that `g-planning` may consume fresh Graphify evidence for broad structural planning while still preferring local exact verification when targets are known.
- Clarify that `g-coding` stays local-first, does not routinely run Graphify/preflight during implementation, and only consumes handed-off Graphify findings as orientation.

## Scope
- Wording-only updates to the Step 0 discovery guidance in two skill files.
- Paired Pi log updates for this bounded feature group.

## Files to Create or Edit
- `packages/pi-g-skills/skills/g-planning/SKILL.md`
- `packages/pi-g-skills/skills/g-coding/SKILL.md`
- `reports/planning/2026-05-04_skill-graphify-guidance-plan.md`
- `logs/coding/2026-05-04_skill-graphify-guidance.md`
- `logs/CURRENT.md`

## Why Each File Exists
- `g-planning/SKILL.md`: add explicit guidance for local exact verification, fresh-graph reuse, freshness-before-reuse, preflight-before-scan, and direct verification before final plan claims.
- `g-coding/SKILL.md`: add explicit local-first coding discovery boundaries and consume-only handling for handed-off Graphify findings.
- planning/coding logs: capture this bounded feature group's intent and implementation evidence.
- `logs/CURRENT.md`: point the repo to the active paired logs.

## What Logic Belongs There
- Skill files should contain concise behavioral guidance only.
- Logs should capture scope, evidence, decisions, and risks.

## What Should Not Go There
- No runtime behavior changes.
- No new Graphify orchestration logic.
- No mandatory Graphify language.

## Dependencies
- `.pi/agent/docs/discovery_policy.md`
- `.pi/agent/docs/graphify_discovery_research.md`
- `.pi/agent/docs/graphify_adapter.md`

## Acceptance Criteria
- `g-planning` explicitly mentions local exact-verification preference, fresh Graphify reuse for broad planning, freshness-before-reuse, preflight-before-scan, and direct verification before final plan claims.
- `g-coding` explicitly mentions local-first implementation discovery, no routine Graphify/preflight during coding, consume-only use of handed-off Graphify findings, and escalation back to planning/research when broad discovery becomes necessary.
- Paired logs are created and `logs/CURRENT.md` points to them.
- Targeted readback/`rg` verification and `git diff --check` pass.

## Likely Failure Modes
- Overstating Graphify as authoritative proof.
- Making `g-coding` too Graphify-aware and encouraging misuse.
- Introducing wording that implies runtime behavior changes.

## Validation Plan
- Use targeted `rg` checks for new wording in each skill file.
- Read back the edited sections.
- Run `git diff --check` in the worktree.

## Recommended Next Step
- Apply minimal wording-only edits plus paired log updates, then run targeted verification and skeptical review.
