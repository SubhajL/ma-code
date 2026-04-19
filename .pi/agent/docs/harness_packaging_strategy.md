# Harness Packaging Strategy

This document is a short architecture stub for Phase K.
It defines how the harness should become reusable across repos without losing the repo-local operating model.

## Purpose
Packaging should make the harness easier to install, version, and reuse.
It should not blur which parts are:
- reusable harness assets
- repo-specific policy or state
- optional extras

## Scope
This doc outlines:
- what should be packageable
- what should stay repo-local
- packaging boundaries
- install/documentation intent
- versioning expectations

It does not define an exact package format yet.

## Packaging principle
The harness should stay repo-local in operation even if parts of it become reusable in distribution.
In other words:
- distribute reusable assets cleanly
- keep project-specific policy and state explicit in each repo

## Good candidates for packaging
Likely reusable:
- generic prompts and role templates
- skills
- extensions
- helper scripts
- optional themes/widgets
- install docs and operator docs

These should be reusable when they do not depend on one repo’s special structure.

## Keep repo-local
These should remain repo-local or require explicit per-repo generation:
- `AGENTS.md`
- `SYSTEM.md`
- repo-specific routing choices
- repo-specific model settings
- runtime state files
- repo-specific docs and logs
- task and queue runtime contents

The package should not hide project policy.

## Packaging boundary rule
A reusable package should provide defaults and scaffolding, not overwrite a repo’s local operating contract silently.

Good package behavior:
- install common assets
- generate missing files intentionally
- document what must be customized

Bad package behavior:
- overwrite repo policy without review
- copy runtime state blindly
- assume one repo’s task/queue history belongs in another

## Versioning intent
Packaging should add clear versioning for:
- prompts/templates
- extensions
- helper scripts
- docs bundle

Versioning should help answer:
- what harness version is installed?
- what changed between versions?
- what migrations, if any, are needed?

## Documentation intent
Phase K should make it possible for another person to:
- install the harness
- configure providers
- understand roles and routing
- operate the harness safely
- troubleshoot normal failures

## Success definition
Phase K is successful when the harness can move between repos cleanly without confusing reusable assets with repo-specific policy and state.
