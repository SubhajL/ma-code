# Harness Package Install / Bootstrap Guide

This guide explains the current HARNESS-040 package/bootstrap path.
It is intentionally conservative.
The goal is to help another repo adopt the harness without copying runtime history, logs, or validation reports.

## What the package helper does
The package helper reads:
- `.pi/agent/package/harness-package.json`

It then separates assets into two groups:

### 1. Reusable assets copied directly
Examples:
- prompts
- routing notes
- extensions
- skills
- teams
- packet/handoff/recovery/validation policy assets
- docs
- scripts
- tests

### 2. Repo-local assets generated from templates
Examples:
- `AGENTS.md`
- `SYSTEM.md`
- `.pi/agent/models.json`
- fresh runtime placeholders under `.pi/agent/state/runtime/*.json`

These generated files are starting points.
They should be reviewed for the target repo before normal use.

## What is intentionally not copied
The bootstrap helper does **not** copy:
- `.git`
- `node_modules`
- `logs/`
- `reports/`
- existing runtime history from `.pi/agent/state/runtime/`
- Pi session HTML artifacts

That is the main safety boundary for HARNESS-040.

## Inspect the package manifest
From the source harness repo:
```bash
cd /path/to/source-harness-repo
node --import tsx scripts/harness-package.ts manifest
node --import tsx scripts/harness-package.ts manifest --json
```

## Bootstrap into another repo
To install the harness into a target repo root:
```bash
cd /path/to/source-harness-repo
node --import tsx scripts/harness-package.ts bootstrap --dest /path/to/target-repo
```

This will:
- copy reusable harness assets
- generate repo-local templates/placeholders only when missing
- merge harness scripts/devDependencies into `package.json`
- write `.pi/agent/package/installed-package.json`

## After bootstrap
Review these files before normal use:
- `AGENTS.md`
- `SYSTEM.md`
- `.pi/agent/models.json`
- `package.json`

Then install dev dependencies in the target repo:
```bash
cd /path/to/target-repo
npm install --no-package-lock
```

Recommended first checks:
```bash
npm run harness:package
npm run harness:status
npm run validate:harness-package
npm run validate:core-workflows
```

## Expected repeatable outcome
A successful bootstrap should leave the target repo with:
- reusable harness assets copied into place
- empty runtime placeholders instead of copied task/queue history
- visible package version metadata in `.pi/agent/package/installed-package.json`
- a package.json that contains the harness scripts/devDependencies without overwriting unrelated existing settings blindly

## Known current boundary
This is packaging/bootstrap scaffolding, not a registry-published npm package.
It is intentionally repo-local and file-copy based for now.
