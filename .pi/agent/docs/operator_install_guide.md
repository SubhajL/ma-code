# Operator Install Guide

This guide explains how to install the current repo-local harness into a repo and get to the first safe operator checks.

## Preconditions
- git repo available locally
- Node.js available
- npm available
- Pi available in the environment you plan to use for live sessions

## Option A — one-shot install (preferred)
Run the `install` subcommand from the source harness repo. It bootstraps, runs `npm install` in the target, runs three cheap validators, probes provider env vars, and prints a `filesToReview` list:
```bash
cd /path/to/source-harness-repo
node --import tsx scripts/harness-package.ts install --dest /path/to/target-repo
```

The same wrapper is exposed as the `harness:install` package script alias once the harness is on the runtime PATH:
```bash
npm run harness:install -- --dest /path/to/target-repo
npm run harness:install:json -- --dest /path/to/target-repo
```

Useful flags: `--json`, `--skip-install`, `--skip-validators`. The wrapper does not set provider API keys, edit `AGENTS.md`/`SYSTEM.md`, or start live workflows.

After it returns, review the files it lists under `filesToReview` (typically `AGENTS.md`, `SYSTEM.md`, `.pi/agent/models.json`, `docs/product/intake-policy.md`) and set any missing provider env vars before live runs.

## Option B — manual bootstrap into another repo
Use this path when you want to inspect each step before continuing.
From this source harness repo:
```bash
cd /path/to/source-harness-repo
node --import tsx scripts/harness-package.ts bootstrap --dest /path/to/target-repo
```

Then in the target repo:
```bash
cd /path/to/target-repo
npm install --no-package-lock
```

Review these generated files before normal use:
- `AGENTS.md`
- `SYSTEM.md`
- `.pi/agent/models.json`
- `package.json`

## Option C — operate this repo directly
```bash
cd /Users/subhajlimanond/dev/ma-code
npm install --no-package-lock
```

## First post-install checks
Run these in order:
```bash
npm run harness:package
npm run harness:status
npm run harness:schedules
npm run validate:harness-package
npm run validate:core-workflows
```

What these confirm:
- package/bootstrap metadata is present
- queue/task state can be inspected
- scheduled workflows can be inspected without hidden queue mutation
- package bootstrap path is still repeatable
- core bounded workflow integration is still green

## Fresh target repo expectations
A successful bootstrap should leave the target repo with:
- copied reusable harness assets
- fresh runtime placeholders under `.pi/agent/state/runtime/`
- no copied `logs/` or `reports/`
- no copied runtime task/queue history
- `.pi/agent/package/installed-package.json` recording the installed harness version
- a bounded `harness:product-intake` helper for safe major-product intake and durable `intake.json` capture
- a bounded `harness:init-feature` helper for lower-level scaffolding of `docs/initiatives/<feature-slug>/`

## What not to assume after install
Install/bootstrap does **not** mean:
- providers are configured already
- routing defaults are correct for the new repo
- repo-specific rules in `AGENTS.md` and `SYSTEM.md` are finalized
- the harness is ready for unattended operation

## Major-feature bootstrap after install
When a new major feature starts, run the safe product intake wrapper first:
```bash
npm run harness:product-intake -- --slug example-major-feature --description "Describe target users, outcome, and constraints" --dry-run
npm run harness:product-intake -- --slug example-major-feature --description "Describe target users, outcome, and constraints" --apply
```

Use the lower-level scaffold only when you intentionally want initiative files without intake metadata:
```bash
npm run harness:init-feature -- --slug example-major-feature
```

Successful helper output is informational only and points operators toward:
- `/skill:g-grill`
- `/skill:g-prd`
- `/skill:g-issues`

## Next docs
After install, continue with:
- provider setup: `.pi/agent/docs/operator_provider_setup.md`
- model routing: `.pi/agent/docs/operator_model_routing_guide.md`
- daily workflow: `.pi/agent/docs/operator_workflow.md`
- packaging reference: `.pi/agent/docs/harness_package_install.md`
