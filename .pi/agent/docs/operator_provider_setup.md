# Operator Provider Setup Guide

This guide explains how to think about provider setup for the current harness.
It focuses on operator behavior, not secret-handling shortcuts.

## Core rule
Do not commit secrets.
Do not rewrite project auth/config rules just to make the harness run.
Follow the target repo's normal provider/auth setup practices.

## Providers currently referenced by routing
Current `.pi/agent/models.json` references models under:
- `openai-codex`
- `anthropic`

## What to verify before a live session
- Pi can see the providers/models you expect in your environment
- any required auth is present outside tracked repo files
- the target repo's `AGENTS.md` / `SYSTEM.md` / local security rules allow the intended provider use

## Cheap first checks
Before a provider-backed validation run, prefer local checks first:
- `npm run validate:harness-routing`
- `npm run validate:core-workflows`
- `npm run validate:harness-package`

These establish a lot of proof without paying for repeated live-provider traffic.

## Live-proof rule
Use one bounded live validator run only when local evidence is not enough.
Do not repeat long live loops by default.

## If provider setup looks wrong
Symptoms may include:
- no models found
- auth failures
- unsupported model IDs
- routing falling back in unexpected ways

Use these docs next:
- troubleshooting: `.pi/agent/docs/operator_troubleshooting_guide.md`
- model routing: `.pi/agent/docs/operator_model_routing_guide.md`

## Repo-local follow-up
If you adopt this harness in another repo, review `.pi/agent/models.json` and adjust routing defaults only after:
- provider availability is confirmed
- local validation is green
- the repo's budget/quality expectations are known
