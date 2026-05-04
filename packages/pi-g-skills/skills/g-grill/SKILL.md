---
name: g-grill
description: Bounded mutual-understanding workflow that asks one focused question at a time, prefers discoverable answers over needless questioning, and produces a clear understanding packet before PRD/planning.
---

# g-grill

Use this skill when the user has a fuzzy request, product idea, or unclear refactor goal and you need to tighten mutual understanding before broader planning.

This is a Pi-native global skill inspired by grill-style clarification workflows.

## Pi log discipline (required)

Before finalizing:
- prefer the repo's Pi-style log convention described in `../../docs/pi-log-convention.md`
- read `logs/CURRENT.md` when present
- if a planning log under `reports/planning/` is active, append the clarification checkpoint there
- otherwise append to the active coding log under `logs/coding/`
- do **not** rely on `.codex/coding-log.current`

If no Pi-style log convention is visible, ask before inventing one.

## Workflow

### 1) Discover what is already knowable
Before asking questions:
- read the obvious local docs (`AGENTS.md`, `README.md`, `CONTEXT.md`, relevant architecture/product docs)
- use `auggie_discover` first when available and bounded
- if Auggie is unavailable or times out, fall back immediately to targeted `read`, `rg`, `find`, and exact inspection
- answer from the repo when the answer is already discoverable

### 2) Ask one focused question at a time
Prefer one focused question at a time when a blocking ambiguity remains.
Do not dump a long questionnaire unless the user explicitly asks for one.

Good clarification targets:
- target users or actors
- problem statement
- desired outcome
- non-goals
- constraints and dependencies
- data/schema/API/UI impact
- acceptance signals
- rollout/backout expectations
- top failure modes

### 3) Keep clarification bounded
Stop once you can state:
- what is being built or decided
- what is explicitly not being built
- what the success signal looks like
- what still needs follow-up

### 4) Hand off cleanly
When clarity is sufficient:
- recommend the next skill explicitly when helpful
  - `g-prd` for a PRD
  - `g-issues` for backlog slicing
  - `g-planning` for implementation planning
  - `g-refactor` for deep-module refactor planning
- preserve assumptions instead of silently resolving them

## Deliverables (required)

Every `g-grill` output must include:
- current understanding
- the smallest next clarification question(s) when needed
- explicit unresolved decisions
- a recommended next skill or next step

## Output contract

Return these top-level sections exactly:
- `## Discovery Path`
- `## Goal Under Discussion`
- `## What I Understood`
- `## Clarifying Questions`
- `## Decisions Still Needed`
- `## Recommendation`
- `## Pi Log Update`

Rules:
- use bullets, not long prose blocks
- if a section is empty, write `- none`
- prefer one focused question at a time
- do not implement code inside this skill unless the user explicitly asks
