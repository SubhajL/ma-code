---
name: g-planning
description: Detailed implementation planning with Auggie-first discovery, Pi-style planning/coding logs, TDD sequencing, decision-complete acceptance criteria, wiring verification, and optional Opus-4.6 second-model synthesis.
---

# g-planning

Use this skill when the user asks for a detailed plan before implementation.

This port preserves the Codex `g-planning` workflow but adapts coding-log persistence to Pi-style repo logs.

## Pi log discipline (required)

Before finishing the plan:
- prefer the repo's Pi-style log convention described in `../../docs/pi-log-convention.md`
- if `logs/CURRENT.md` exists, read it first
- for a new bounded feature group, create/update:
  - `reports/planning/YYYY-MM-DD_<feature>-plan.md`
  - `logs/coding/YYYY-MM-DD_<feature>.md`
  - `logs/CURRENT.md`
- do **not** recreate Codex `.codex/coding-log.current`

If the repo does not expose a Pi-style log convention, ask before inventing one.

## Step 0: codebase discovery (required)

Use Auggie first when it is available and can be treated as non-blocking.

Preferred tool:
- `auggie_discover`

Rules:
- keep the attempt bounded to about 2 seconds
- if Auggie is unavailable, errors, or recommends fallback, immediately continue with:
  - `read`
  - `grep` / `rg`
  - `find`
  - targeted file inspection
- explicitly record which discovery path was used

## Step 1: clarify the task (required)

Ask clarifying questions if important requirements are ambiguous.

Lock these before finalizing the plan:
- goal
- non-goals
- success criteria
- public surface changes
- rollout/backout expectations
- top failure modes

## Step 2: Draft A

Produce a complete baseline plan.

## Step 3: Draft B

Produce a second plan with at least one meaningful difference, such as:
- smaller surface area
- different test strategy
- different layering
- fewer moving parts

## Step 4: synthesis

Compare the drafts and produce one unified plan.

For medium- or high-risk work:
- use `second_model_plan` when available
- this package's second-model helper is intentionally restricted to Claude Opus 4.6
- if the tool falls back, say explicitly that the main/current model plan was kept

## Required TDD sequence

The plan must explicitly include the tests-first order:
1. add or stub the relevant test(s)
2. run them and confirm they fail for the right reason
3. implement the smallest change that can pass
4. refactor minimally if needed
5. run the relevant fast gates again

Do not reduce this to generic “write tests.”

## Required plan content

Every final plan should include:
- overview
- files to change
- new files if any
- implementation steps
- explicit TDD sequence
- test coverage
- goal / non-goals
- measurable success criteria
- public interfaces affected
- edge cases and failure modes
- rollout / monitoring notes when relevant
- acceptance checks with concrete commands
- wiring verification table
- validation plan
- risks and open questions

## Wiring verification (required)

For each new runtime component, document:
- runtime entry point
- registration location
- schema/table if applicable
- how you will verify it is actually wired

Use a compact table when relevant.

## Output contract

Return these top-level sections exactly:
- `## Discovery Path`
- `## Goal`
- `## Non-Goals`
- `## Assumptions`
- `## Cross-Model Check`
- `## Plan Draft A`
- `## Plan Draft B`
- `## Unified Plan`
- `## Files to Modify`
- `## New Files`
- `## TDD Sequence`
- `## Test Coverage`
- `## Acceptance Criteria`
- `## Wiring Checks`
- `## Validation`
- `## Risks`
- `## Pi Log Update`

Rules:
- use bullets, not long prose blocks
- if a section is empty, write `- none`
- include the final planning-log path and coding-log path
- do not implement code in this skill
