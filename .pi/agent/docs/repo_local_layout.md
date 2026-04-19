# Repo-Local Layout Decision

This harness is organized so that **each repo that wants to use the Pi harness keeps the Pi-specific assets inside that repo**.

## Root files
- `AGENTS.md`
- `SYSTEM.md`

These stay at repo root so Pi can discover them as project-level instructions.

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

## Why
- easier to version with the repo
- easier to review in git
- easier to copy to another repo
- keeps the harness self-contained
