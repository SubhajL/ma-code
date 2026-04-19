---
name: g-coding
description: Strict TDD implementation workflow with Auggie-first discovery, Pi-style coding logs, RED/GREEN evidence, wiring verification, skeptical self-review, flake checks, and mandatory `g-check` handoff.
---

# g-coding

Use this skill when the user wants implementation or debugging performed with Codex-style discipline.

This port preserves the Codex `g-coding` workflow but writes evidence into Pi-style repo logs.

## Pi coding-log discipline (required)

Prefer the repo convention described in `../../docs/pi-log-convention.md`.

Before implementation or before claiming progress:
- read `logs/CURRENT.md` when present
- locate the active coding log under `logs/coding/`
- append a timestamped work summary after each coherent unit of work
- do **not** use `.codex/coding-log.current`

Each appended summary should include:
- goal of the change
- files changed and why
- tests added or changed
- exact RED command and key failure reason
- exact GREEN command
- other validation commands run
- wiring verification evidence
- behavior changes and risk notes
- follow-ups or known gaps

If no RED run is practical, say why explicitly.

## Step 0: context and discovery (required)

Before editing:
- read relevant repo instructions (`AGENTS.md`, `README.md`, repo docs)
- use `auggie_discover` first when available and bounded
- if it is unavailable or recommends fallback, immediately continue with direct file inspection and exact-string searches
- record the discovery path in the coding log

## TDD workflow (required)

Use strict tests-first sequencing:
1. scaffold the smallest test or stub needed
2. run it and confirm the failure is for the right reason
3. implement the smallest change that can pass
4. refactor minimally if needed
5. run fast quality gates
6. repeat

Do not skip directly to implementation unless the user explicitly asks for a non-TDD exception.

## RED / GREEN evidence (required)

You must preserve concrete evidence:
- RED: exact command + why it failed
- GREEN: exact command + why it now passes

Examples:
- `pytest tests/foo_test.py -q`
- `pnpm test -- foo.spec.ts`
- `go test ./pkg/foo -run TestBar`

## Quality gates

Run the smallest relevant gates for the touched surface, such as:
- formatter
- lint
- typecheck
- targeted tests
- build when appropriate

## Wiring verification (required)

For any new runtime component, verify non-test wiring before done.

Check for things like:
- route registration
- non-test call sites
- env var loading
- schema/table name alignment
- startup registration or import wiring

Document the proof in the coding log.

## Skeptical self-review / QCHECK

Before handing work off:
- review your own changes skeptically
- look for underimplementation, missing tests, wiring gaps, risky defaults, and hidden assumptions
- fix important issues before running formal review

## Formal `g-check` handoff (required)

Before calling implementation complete:
- run the equivalent of `g-check` on the intended change set
- use `/skill:g-check` if skill loading is available
- otherwise follow the `g-check` report structure manually
- append the review artifact to the current Pi coding log

## Flakiness rule

When tests are relevant, run them repeatedly enough to catch flakiness.
Default target:
- 3 consecutive passing runs for the changed test scope

If that is too expensive, explain the narrower choice and residual risk.

## Output contract

Return these top-level sections exactly:
- `## Discovery Path`
- `## Goal`
- `## TDD Plan`
- `## Changes`
- `## RED Evidence`
- `## GREEN Evidence`
- `## Wiring Verification`
- `## Quality Gates`
- `## QCHECK`
- `## g-check Handoff`
- `## Risks / Follow-ups`
- `## Pi Log Update`

Rules:
- use bullets, not long prose blocks
- if a section is empty, write `- none`
- do not claim completion without evidence
