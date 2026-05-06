# Repo-Local Layout Decision

This harness is organized so that **each repo that wants to use the Pi harness keeps the Pi-specific assets inside that repo**.

## Root files
- `AGENTS.md`
- `SYSTEM.md`
- `docs/`

These stay at repo root so Pi can discover project-level instructions and durable product/governance artifacts.

## Repo-local Pi folder
Everything else lives under:
- `.pi/agent/`

This includes:
- prompts
- templates
- routing
- team definitions
- schemas
- runtime state placeholders
- extension specs
- skills
- harness docs
- intake policy metadata under `.pi/agent/intake/`

## Why
- easier to version with the repo
- easier to review in git
- easier to copy to another repo
- keeps the harness self-contained

## Durable docs vs transient execution evidence
- keep durable product/governance artifacts in repo-root `docs/`
- keep harness/runtime docs under `.pi/agent/docs/`
- keep transient execution evidence in:
  - `reports/planning/`
  - `logs/coding/`
  - `reports/validation/`

## Initiative folders
- every major feature should use `docs/initiatives/<feature-slug>/`
- expected minimum files are:
  - `prd.md`
  - `backlog.md`
  - `decisions.md`
