---
name: g-review
description: Holistic system review with docs-first intent mapping, Auggie-first as-is inspection, drift analysis, tactical and strategic recommendations, and Pi-style coding-log append behavior.
---

# g-review

Use this skill when the user asks for a holistic review of a repo or subsystem, improvement ideas, or big architectural changes.

This port preserves the Codex `g-review` workflow but appends review output to the current Pi coding log.

## Pi coding-log discipline (required)

Before finalizing the review:
- read `logs/CURRENT.md` when present
- resolve the active coding log under `logs/coding/`
- append the review there
- do **not** rely on `.codex/coding-log.current`

## Workflow

### 1) Clarify scope
Ask at most two short questions if needed:
- entire system or a subsystem?
- target environment relevance, if needed?

If the user says “review the system,” default to the entire system.

### 2) Establish intended architecture
Read the docs that define intent first, such as:
- `AGENTS.md`
- `README.md`
- `CONTEXT.md`
- other repo architecture/spec docs

Extract the intended:
- responsibilities and boundaries
- contracts
- safety invariants
- operational expectations

### 3) Map the as-is implementation
Use Auggie first when available and bounded.
If Auggie is unavailable or recommends fallback, switch immediately to:
- `read`
- `grep` / `rg`
- `find`
- targeted inspection of entry points, tests, config, and wiring files

Produce a short as-is pipeline diagram in text.

### 4) Drift analysis
Compare intended vs implemented:
- boundaries and contracts
- schema alignment
- concurrency and restart safety
- observability and operability
- config and secrets hygiene

For each important drift, summarize:
- Intended
- Implemented
- Impact
- Fix direction

### 5) Recommendations in two horizons
Provide:
- Tactical Improvements (1–3 days)
- Strategic Improvements (1–6 weeks)

For any big architectural change, include:
- pros
- cons
- migration path
- tests / rollout notes

## Deliverables (required)

Every `g-review` output must include:
1. as-is pipeline diagram
2. drift matrix
3. prioritized roadmap
4. evidence links for critical/high items

## Output contract

Return these top-level sections exactly:
- `## Discovery Path`
- `## Reviewed Scope`
- `## As-Is Pipeline Diagram`
- `## High-Level Assessment`
- `## Strengths`
- `## Drift Matrix`
- `## Key Risks / Gaps`
- `## Tactical Improvements (1–3 days)`
- `## Strategic Improvements (1–6 weeks)`
- `## Big Architectural Changes`
- `## Evidence Links`
- `## Open Questions / Assumptions`
- `## Pi Log Update`

Rules:
- use bullets, not long prose blocks
- if a section is empty, write `- none`
- recommendations must be actionable and evidence-backed
- do not change product code inside this skill unless the user explicitly asks
