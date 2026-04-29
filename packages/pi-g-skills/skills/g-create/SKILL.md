---
name: g-create
description: Bounded branch/commit creation workflow with working-tree review-set discipline, Graphite-first create when available, hook-aware commit gating, and Pi-style coding-log append behavior.
---

# g-create

Use this skill when the user wants to turn a ready working tree into a bounded branch/commit artifact.

This port preserves the Codex `g-create` name but adapts creation flow to Pi-style repo logs and a bounded Git/GitHub workflow.

## Pi coding-log discipline (required)

Before finalizing the creation step:
- read `logs/CURRENT.md` when present
- resolve the active coding log under `logs/coding/`
- append a timestamped creation summary there
- do **not** rely on `.codex/coding-log.current`

If no Pi-style log convention is visible, ask before inventing one.

## Preconditions

Before creating a branch/commit artifact:
- the intended review set must be clear
- unrelated changes must be excluded, stashed, or explicitly called out
- if the repo forbids direct work on `main`, stop and move to a bounded branch/worktree first
- if `g-check` has not been run on the intended working-tree review set, do that before create unless the user explicitly waives it

If the review target is unclear, ask one short question:
- full working tree
- staged review set
- selected files only

## Discovery

Use the smallest credible repo-state inspection path:
- `git status -sb`
- `git branch --show-current`
- `git diff --name-only --cached`
- `git diff --name-only`
- `gt status` / `gt ls` when Graphite is available and relevant

Keep discovery compact and evidence-based.

## Required sequence

1. confirm current branch/worktree state
2. confirm the intended review set
3. stage any new files that must be part of the review set
4. run `g-check` on the working tree when the user expects disciplined closeout
5. choose the creation path:
   - Graphite-first when `gt` is available and the repo uses it
   - standard git fallback when Graphite is unavailable or out of scope
6. let pre-commit hooks run normally
7. report the created branch/commit artifact and any hook failures

## Creation path guidance

### Graphite-first path
Prefer when `gt` is available and the repo is already using Graphite-style branch/submit flow.

Examples:
- `gt create -am "feat(scope): short summary"`
- `gt add <files>` then `gt create -m "feat(scope): short summary"`

### Standard git fallback
Use when Graphite is unavailable or the repo is not using it.

Examples:
- `git switch -c <bounded-branch>` when still on the wrong branch
- `git add <intended-files>`
- `git commit -m "feat(scope): short summary"`

## Hook and validation rules

- do **not** use `--no-verify` unless the user explicitly asks and repo policy allows it
- prefer targeted tests and checks before create instead of learning everything from hook failure
- if hooks fail, fix the issue and rerun the smallest relevant gates before retrying create

## Reporting requirements

When create succeeds, report:
- branch name
- commit SHA
- commit message
- files included in the review set
- whether hooks ran and passed

When create fails, report:
- exact failing command
- exact hook or validation failure
- next fix direction

## Output contract

Return these top-level sections exactly:
- `## Discovery Path`
- `## Goal`
- `## Preconditions`
- `## Review Set`
- `## Branch / Commit Plan`
- `## Creation Command`
- `## Hook / Validation Expectations`
- `## Risks / Follow-ups`
- `## Pi Log Update`

Rules:
- use bullets, not long prose blocks
- if a section is empty, write `- none`
- do not claim success without the actual branch/commit evidence
