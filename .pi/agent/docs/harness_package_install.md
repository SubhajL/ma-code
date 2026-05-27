# Harness Package Install / Bootstrap Guide

This guide explains the current HARNESS-040 package/bootstrap path.
It is intentionally conservative.
The goal is to help another repo adopt the harness without copying runtime history, logs, or validation reports.

## One-shot install (preferred)

The fastest path is the `install` subcommand. It wraps bootstrap, runs `npm install --no-package-lock` in the target, runs three cheap validators (`validate:harness-package`, `validate:core-workflows`, `validate:harness-routing`), probes provider env vars, and reports the files you still need to review by hand.

```bash
cd /path/to/source-harness-repo
node --import tsx scripts/harness-package.ts install --dest /path/to/target-repo
```

Useful flags:
- `--json` — emit machine-readable output
- `--skip-install` — skip the `npm install` step (useful in offline/CI flows)
- `--skip-validators` — skip the cheap validator runs (useful when you only want bootstrap + install)

`harness:install` is not deployment automation. It does not set provider API keys, customize `AGENTS.md`/`SYSTEM.md`, edit `.pi/agent/models.json`, or start any live workflow. After the wrapper returns, review the files it lists under `filesToReview` and set any missing provider env vars before live work.

The longer manual path below remains supported for cases where the wrapper is not appropriate (e.g. you want to inspect each step before continuing).

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
- durable docs scaffold such as:
  - `docs/product/intake-policy.md`
  - `docs/initiatives/README.md`
  - `docs/initiatives/TEMPLATE/{prd,backlog,decisions}.md`

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
- `docs/product/intake-policy.md`
- `docs/initiatives/README.md`

Then start the operator docs set at:
- `.pi/agent/docs/operator_manual.md`
- `.pi/agent/docs/operator_install_guide.md`

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

When a new major feature starts in the target repo, use product intake first:
```bash
npm run harness:product-intake -- --slug example-major-feature --description "Describe target users, outcome, and constraints" --dry-run
npm run harness:product-intake -- --slug example-major-feature --description "Describe target users, outcome, and constraints" --apply
```

`harness:product-intake` captures `docs/initiatives/<feature-slug>/intake.json`, blocks vague descriptions with focused clarification questions, and creates PRD/backlog/decisions scaffolds only when the intake is ready for PRD. The lower-level scaffold remains available when explicitly needed:
```bash
npm run harness:init-feature -- --slug example-major-feature
```

Successful helper output is informational only and suggests the next planning skills:
- `/skill:g-grill`
- `/skill:g-prd`
- `/skill:g-issues`

## Expected repeatable outcome
A successful bootstrap should leave the target repo with:
- reusable harness assets copied into place
- empty runtime placeholders instead of copied task/queue history
- durable intake and initiative docs scaffold under `docs/`
- the `harness:product-intake` package alias for safe major-product intake
- the `harness:init-feature` package alias for explicit initiative-folder bootstrap
- visible package version metadata in `.pi/agent/package/installed-package.json`
- a package.json that contains the harness scripts/devDependencies without overwriting unrelated existing settings blindly

## Known current boundary
This is packaging/bootstrap scaffolding, not a registry-published npm package.
It is intentionally repo-local and file-copy based for now.
