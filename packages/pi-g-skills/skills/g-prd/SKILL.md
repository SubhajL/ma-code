---
name: g-prd
description: PRD synthesis workflow that turns clarified goals into a bounded product requirements document with problem statement, user stories, implementation decisions, testing decisions, and out-of-scope boundaries.
---

# g-prd

Use this skill when the user wants a PRD or a structured product/planning artifact before implementation.

This is a Pi-native global skill inspired by PRD-writing workflows.

## Pi log discipline (required)

Before finalizing:
- prefer the repo's Pi-style log convention described in `../../docs/pi-log-convention.md`
- read `logs/CURRENT.md` when present
- prefer appending PRD output to the active planning log under `reports/planning/`
- if no planning log is active, append to the active coding log under `logs/coding/`
- do **not** rely on `.codex/coding-log.current`

If no Pi-style log convention is visible, ask before inventing one.

## Workflow

### 1) Establish source context
Read what already exists first:
- product/architecture docs
- `AGENTS.md`, `README.md`, `CONTEXT.md`
- relevant issues, specs, or prior planning notes
- use `auggie_discover` first when available and bounded
- if Auggie is unavailable, fall back immediately to targeted `read`, `rg`, and exact inspection

### 2) Refuse fake certainty
If the request is still too fuzzy for a useful PRD:
- say so explicitly
- ask for clarification directly, or recommend `g-grill`

### 3) Write a bounded PRD
A useful PRD should include:
- problem statement
- solution summary
- users / actors
- user stories
- implementation decisions
- testing decisions
- out of scope
- further notes and unresolved questions

### 4) Keep it execution-friendly
The PRD should be specific enough to drive planning, but not so file-path-specific that it becomes stale immediately.
Prefer stable domain language and decision framing.

## Deliverables (required)

Every `g-prd` output must include:
- problem statement
- solution summary
- user stories
- implementation decisions
- testing decisions
- out-of-scope boundaries

## Output contract

Return these top-level sections exactly:
- `## Discovery Path`
- `## Product Goal`
- `## Problem Statement`
- `## Solution Summary`
- `## Users / Actors`
- `## User Stories`
- `## Implementation Decisions`
- `## Testing Decisions`
- `## Out of Scope`
- `## Further Notes`
- `## Pi Log Update`

Rules:
- use bullets, not long prose blocks
- if a section is empty, write `- none`
- recommendations must be actionable and bounded
- do not implement code inside this skill unless the user explicitly asks
