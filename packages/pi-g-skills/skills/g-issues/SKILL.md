---
name: g-issues
description: Vertical-slice backlog planning workflow that turns a PRD or approved plan into demonstrable HITL/AFK slices with explicit dependencies, acceptance, and proof expectations.
---

# g-issues

Use this skill when the user wants backlog issues, Kanban slices, or a vertical-slice execution plan derived from a PRD or approved plan.

This is a Pi-native global skill inspired by issue-splitting workflows.

## Pi log discipline (required)

Before finalizing:
- prefer the repo's Pi-style log convention described in `../../docs/pi-log-convention.md`
- read `logs/CURRENT.md` when present
- prefer appending issue-splitting output to the active planning log under `reports/planning/`
- if no planning log is active, append to the active coding log under `logs/coding/`
- do **not** rely on `.codex/coding-log.current`

If no Pi-style log convention is visible, ask before inventing one.

## Workflow

### 1) Read the planning source
Start from a PRD, approved plan, or clarified goal.
If the source is too vague, say so and recommend `g-grill` or `g-prd` first.

### 2) Slice vertically
Issues should be thin vertical slices, not broad horizontal layers.
Each slice should be independently demonstrable or verifiable.

### 3) Classify workflow mode
Mark each issue as:
- `HITL` when it needs human judgment, approval, or ambiguous product decisions
- `AFK` when scope, validation, and safety boundaries are already clear

### 4) Preserve execution details
Each issue should include:
- title
- type (`HITL` or `AFK`)
- user stories covered
- what to build
- acceptance criteria
- validation proof
- dependencies
- likely files or domains affected

## Deliverables (required)

Every `g-issues` output must include:
- slicing principles used
- the issue list
- dependency view
- explicit HITL / AFK split
- validation/proof expectations

## Output contract

Return these top-level sections exactly:
- `## Discovery Path`
- `## Planning Source`
- `## Slicing Principles`
- `## Issue List`
- `## Dependency Graph`
- `## HITL / AFK Split`
- `## Validation Strategy`
- `## Pi Log Update`

Rules:
- use bullets, not long prose blocks
- if a section is empty, write `- none`
- issues are vertical slices, not layer buckets
- dependencies must be explicit
- do not create runtime tasks or queue jobs inside this skill unless the user explicitly asks
