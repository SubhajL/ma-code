---
name: g-check
description: Skeptical code review for working-tree, commit, or PR changes with severity-ordered findings, exact fix direction, required tests, and Pi-style coding-log append behavior.
---

# g-check

Use this skill for skeptical review of a working tree, commit, commit range, or PR diff.

This port preserves the Codex `g-check` workflow but appends review artifacts to the current Pi coding log instead of `.codex/coding-log.current`.

## Pi coding-log discipline (required)

Before finalizing the review:
- read `logs/CURRENT.md` when present
- resolve the active coding log under `logs/coding/`
- append a timestamped review section there
- do **not** rely on `.codex/coding-log.current`

If no Pi-style log convention is visible, ask before inventing one.

## Review target

If the target is unclear, ask one short question:
- `working-tree` (default)
- `last-commit`
- `commit-range`
- `pr-diff`

## Discovery

Use Auggie-first discovery when available and bounded:
- inspect likely entry points, tests, and touched runtime wiring
- if Auggie is unavailable or recommends fallback, switch immediately to direct file inspection and exact-string search
- keep inspection minimal and evidence-based

## Review requirements

Produce findings first, ordered by severity:
- CRITICAL
- HIGH
- MEDIUM
- LOW

Each important finding should include:
- what can go wrong
- why it matters
- exact file reference when possible
- concrete fix direction
- tests or validation needed

Then include:
- open questions / assumptions
- recommended tests / validation
- rollout notes when relevant

## Review scope commands

Use the smallest credible inspection path.
Examples:
- `git status --porcelain=v1`
- `git diff --name-only`
- `git diff --stat`
- targeted `git diff -- <path>`
- `git show --name-status --stat <sha>`
- `gh pr view <N> --json ...`
- `gh pr diff <N>` only when needed

## Pi coding-log append format

Append a section like:

```markdown
## Review (<LOCAL_TIMESTAMP>) - <scope>

### Reviewed
- Repo: <git root>
- Branch: <branch>
- Scope: <working-tree|sha|range|pr>
- Commands Run: <commands>

### Findings
CRITICAL
- ...

HIGH
- ...

MEDIUM
- ...

LOW
- ...

### Open Questions / Assumptions
- ...

### Recommended Tests / Validation
- ...

### Rollout Notes
- ...
```

## Output contract

Return these top-level sections exactly:
- `## Summary`
- `## Findings by Severity`
- `## Required Fixes`
- `## Optional Improvements`
- `## Open Questions / Assumptions`
- `## Recommended Tests / Validation`
- `## Rollout Notes`
- `Review Verdict: changes_required | no_required_fixes`

Rules:
- use bullets, not long prose blocks
- if a section is empty, write `- none`
- do not fix product code inside this skill unless the user explicitly asks
