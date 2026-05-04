---
name: g-refactor
description: Deep-module refactor planning workflow that analyzes interface/seam/depth/leverage/locality, applies the deletion test, classifies dependency categories, and produces a bounded migration plan.
---

# g-refactor

Use this skill when the user wants a refactor plan for an existing subsystem, especially when the problem is architectural sprawl, shallow modules, poor seams, or over-mocked tests.

This is a Pi-native global skill inspired by deep-module refactoring workflows.

## Pi log discipline (required)

Before finalizing:
- prefer the repo's Pi-style log convention described in `../../docs/pi-log-convention.md`
- read `logs/CURRENT.md` when present
- prefer appending refactor analysis to the active planning log under `reports/planning/`
- if no planning log is active, append to the active coding log under `logs/coding/`
- do **not** rely on `.codex/coding-log.current`

If no Pi-style log convention is visible, ask before inventing one.

## Workflow

### 1) Map the target and current friction
Read the target module/subsystem and the docs that describe intent.
Use `auggie_discover` first when available and bounded; otherwise fall back immediately to targeted `read`, `rg`, `find`, and exact inspection.

### 2) Use deep-module vocabulary explicitly
Analyze with these concepts:
- module
- interface
- seam
- adapter
- depth
- leverage
- locality

### 3) Apply the deletion test
Use the deletion test to distinguish shallow modules from deep modules.
Ask:
- if this module disappeared, would complexity disappear too?
- or would complexity spill into callers?

### 4) Classify dependency categories
Call out dependency categories before proposing seams:
- in-process
- local-substitutable
- remote but owned
- true external

### 5) Produce a bounded refactor plan
The plan should state:
- current friction
- proposed interface / seam shape
- what complexity moves behind the interface
- tests that survive internal refactors because the interface is the test surface
- migration path and rollback point

## Deliverables (required)

Every `g-refactor` output must include:
- current friction summary
- interface / seam analysis
- dependency categories
- refactor plan
- migration / rollback notes

## Output contract

Return these top-level sections exactly:
- `## Discovery Path`
- `## Refactor Target`
- `## Current Friction`
- `## Interface / Seam Analysis`
- `## Dependency Classification`
- `## Refactor Plan`
- `## Test Strategy`
- `## Migration / Rollback`
- `## Risks / Assumptions`
- `## Pi Log Update`

Rules:
- use bullets, not long prose blocks
- if a section is empty, write `- none`
- recommendations must be bounded and migration-aware
- do not implement code inside this skill unless the user explicitly asks
