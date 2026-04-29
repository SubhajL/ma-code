---
name: g-submit
description: Bounded PR submission workflow with compact repo/PR inspection, Graphite-first submit when available, GitHub fallback, CI-aware reporting, and Pi-style coding-log append behavior.
---

# g-submit

Use this skill when the user wants to create or update a PR from a bounded ready branch.

This port preserves the Codex `g-submit` name but adapts submission flow to Pi-style repo logs and a bounded Git/GitHub workflow.

## Pi coding-log discipline (required)

Before finalizing the submission step:
- read `logs/CURRENT.md` when present
- resolve the active coding log under `logs/coding/`
- append a timestamped submission summary there
- do **not** rely on `.codex/coding-log.current`

If no Pi-style log convention is visible, ask before inventing one.

## Preconditions

Before submitting a PR:
- the branch must already exist and contain the intended commit(s)
- unrelated local dirt should be excluded or explicitly explained
- quality gates and `g-check` evidence should already exist when the repo expects them
- the base branch should be clear (`main` by default unless the repo says otherwise)

If the submission target is unclear, ask one short question:
- new PR
- update existing PR
- draft PR

## Discovery

Use compact repo/PR state inspection first:
- `git status -sb`
- `git branch -vv`
- `gt status` / `gt ls` / `gt pr list` when Graphite is available and relevant
- `gh pr view --json number,url,state,mergeStateStatus,headRefName,baseRefName`
- `gh pr checks <N>` only when a PR already exists or was just created

Do not read full diffs or CI logs unless a failure requires diagnosis.
Do not use `gh pr checks --watch`; poll manually only when needed.

## Required sequence

1. confirm branch cleanliness and current base/HEAD state
2. determine whether a PR already exists for the branch
3. choose the submission path:
   - Graphite-first when `gt` is available and the repo uses stacks
   - standard GitHub fallback when Graphite is unavailable or out of scope
4. submit or update the PR
5. verify the compact PR state and CI/check summary
6. report URL, state, and next action

## Submission path guidance

### Graphite-first path
Prefer when `gt` is available and the repo is already using Graphite-style stacks.

Examples:
- `gt submit --publish`
- `gt submit --draft`
- `gt submit --stack --publish`

### Standard GitHub fallback
Use when Graphite is unavailable or the repo is not using it.

Examples:
- `git push -u origin <branch>`
- `gh pr create --base <base> --head <branch> --title "..." --body-file ...`
- `gh pr view --json number,url,state,mergeStateStatus,headRefName,baseRefName`

## CI and reporting rules

After submission, report:
- PR number and URL
- branch and base branch
- draft/open state
- compact CI/check status
- next recommended action

If submission fails, report:
- exact failing command
- whether the problem is local git state, auth, Graphite state, or GitHub state
- the smallest next fix

## Out of scope

- do not merge to `main` by default
- do not rerun large validation loops unless cheaper evidence is insufficient
- do not widen a bounded PR into unrelated cleanup

## Output contract

Return these top-level sections exactly:
- `## Discovery Path`
- `## Goal`
- `## Repo / Stack State`
- `## Preconditions`
- `## Submission Plan`
- `## Commands`
- `## CI / Validation Expectations`
- `## Risks / Follow-ups`
- `## Pi Log Update`

Rules:
- use bullets, not long prose blocks
- if a section is empty, write `- none`
- do not claim submission success without the PR URL or exact failure evidence
