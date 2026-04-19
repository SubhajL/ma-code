# Pi Log Convention for `g-*` Skills

This package adapts Codex coding-log behavior to a Pi-style repo convention.

## Preferred repo-local convention
When the repo provides these files, use them:
- `logs/CURRENT.md`
- `logs/coding/`
- `reports/planning/`
- `logs/README.md`

## Current log pointer
Use `logs/CURRENT.md` as the active index.

It should point to:
- the current coding log
- the current planning log

## New feature group workflow
For a new bounded feature group:
1. create a planning log in `reports/planning/YYYY-MM-DD_<feature>-plan.md`
2. create a coding log in `logs/coding/YYYY-MM-DD_<feature>.md`
3. update `logs/CURRENT.md` to point to both
4. append evidence as work progresses

## Existing feature group workflow
If the active `logs/CURRENT.md` entry already matches the task you are continuing:
- append to the existing paired logs instead of creating a new set

## If the repo has no Pi-style log convention
- first look for repo-local instructions in `AGENTS.md`, `README.md`, or other operator docs
- if no convention is visible, ask the user whether to create a Pi-style paired log set
- do not silently recreate Codex `.codex/coding-log.current`

## Coding log evidence expectations
A coding log should capture:
- scope
- files investigated
- files changed
- exact validation or test evidence when appropriate
- key findings
- decisions made
- known risks
- current outcome

## Planning log expectations
A planning log should capture:
- goal
- scope
- files to modify
- why each file exists
- acceptance criteria
- likely failure modes
- validation plan
