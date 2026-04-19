# GPT-5.4-First Pi Harness Implementation Summary

This update thoroughly implements the GPT-5.4-first split across the harness foundation.

## Implemented in this pack
- GPT-5.4-optimized `AGENTS.md`
- Pi-specific `SYSTEM.md`
- revised role files with structured contracts
- revised prompt templates with explicit outputs
- GPT-5.4-first routing defaults
- updated routing notes
- file map and UI status notes
- starting prompt for building the harness in Pi

## Still intentionally not implemented
- live `.ts` extensions
- live queue runner
- live UI widgets
- live task tool

---

# Repo-local structure update

The harness is now reorganized so that:

- `AGENTS.md` and `SYSTEM.md` stay at the repo root
- all other Pi-specific harness assets live under `.pi/agent/`

That means:
- routing docs moved under `.pi/agent/routing/`
- team YAML moved under `.pi/agent/teams/`
- harness docs moved under `.pi/agent/docs/`
- schemas moved under `.pi/agent/state/schemas/`
- runtime-state placeholders moved under `.pi/agent/state/runtime/`

This is the preferred layout when each repo should contain the Pi harness assets it uses.
