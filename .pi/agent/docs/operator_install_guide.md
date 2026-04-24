# Operator Install Guide

This guide explains how to install the current repo-local harness into a repo and get to the first safe operator checks.

## Preconditions
- git repo available locally
- Node.js available
- npm available
- Pi available in the environment you plan to use for live sessions

## Option A — bootstrap this harness into another repo
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

## Option B — operate this repo directly
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

## What not to assume after install
Install/bootstrap does **not** mean:
- providers are configured already
- routing defaults are correct for the new repo
- repo-specific rules in `AGENTS.md` and `SYSTEM.md` are finalized
- the harness is ready for unattended operation

## Next docs
After install, continue with:
- provider setup: `.pi/agent/docs/operator_provider_setup.md`
- model routing: `.pi/agent/docs/operator_model_routing_guide.md`
- daily workflow: `.pi/agent/docs/operator_workflow.md`
- packaging reference: `.pi/agent/docs/harness_package_install.md`
