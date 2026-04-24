# Harness Packaging Strategy

This document defines the current HARNESS-040 packaging/bootstrap approach.
It explains how the harness can move across repos without losing the repo-local operating model.

## Purpose
Packaging should make the harness easier to install, version, and reuse.
It should not blur which parts are:
- reusable harness assets
- repo-specific policy or state
- optional extras

## Scope
This doc defines:
- the machine-readable package manifest
- what is copied as reusable assets
- what is generated as repo-local scaffolding
- what is intentionally excluded
- how bootstrap/install works
- versioning expectations

## Packaging principle
The harness should stay repo-local in operation even if parts of it become reusable in distribution.
In other words:
- distribute reusable assets cleanly
- keep project-specific policy and state explicit in each repo

## Current package format
Current machine-readable manifest:
- `.pi/agent/package/harness-package.json`

Current bootstrap helper:
- `scripts/harness-package.ts`

Current install guide:
- `.pi/agent/docs/harness_package_install.md`

The manifest separates:
- reusable assets copied directly
- repo-local files generated from templates
- excluded paths that must never be copied during bootstrap

## Reusable vs repo-local boundary
### Reusable assets copied directly
Examples now include:
- `.pi/agent/prompts/`
- `.pi/agent/extensions/`
- `.pi/agent/skills/`
- `.pi/agent/teams/`
- `.pi/agent/packets/`
- `.pi/agent/handoffs/`
- `.pi/agent/recovery/`
- `.pi/agent/validation/`
- `.pi/agent/docs/`
- `.pi/agent/schedules/`
- `.pi/agent/state/schemas/`
- `scripts/`
- `tests/`

### Repo-local files generated from templates
Examples now include:
- `AGENTS.md`
- `SYSTEM.md`
- `.pi/agent/models.json`
- fresh runtime placeholders under `.pi/agent/state/runtime/`

These generated files are starting points, not silent policy replacement.

## Packaging boundary rule
The bootstrap helper should provide defaults and scaffolding, not overwrite a repo’s local operating contract silently.

Good package behavior now means:
- copy reusable harness assets
- generate missing repo-local files intentionally
- merge `package.json` conservatively
- preserve existing repo-local files instead of overwriting them
- write an explicit install/version record

Bad package behavior still means:
- overwrite repo policy without review
- copy runtime state blindly
- copy logs/reports/history into the target repo
- assume one repo’s task/queue history belongs in another

## Versioning intent
Current versioning is explicit through:
- `.pi/agent/package/harness-package.json` -> `packageVersion`
- `.pi/agent/package/installed-package.json` in the target repo after bootstrap

Versioning should help answer:
- what harness version was installed?
- when was it installed?
- which files were copied vs generated?
- what warnings/manual review items remained?

## Install/bootstrap flow
Current bounded bootstrap flow is:
1. inspect the manifest with `node --import tsx scripts/harness-package.ts manifest`
2. bootstrap into a target repo with `node --import tsx scripts/harness-package.ts bootstrap --dest <repo>`
3. review generated repo-local files (`AGENTS.md`, `SYSTEM.md`, `.pi/agent/models.json`, `package.json`)
4. install dev dependencies in the target repo
5. run validators such as `npm run validate:harness-package` and `npm run validate:core-workflows`

Detailed steps live in:
- `.pi/agent/docs/harness_package_install.md`

## Success definition
HARNESS-040 is successful when the harness can move between repos cleanly without confusing reusable assets with repo-specific policy and state.

The current acceptance signal is:
- another repo can bootstrap the harness repeatably
- runtime history is not copied
- versioning is explicit
- install/bootstrap instructions are visible and reviewable
