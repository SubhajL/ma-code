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
- `SYSTEM.md` (repo governance doc; pi does not read it)
- `.pi/APPEND_SYSTEM.md` (the project guidance pi appends to its system prompt)
- `.pi/agent/models.json` (a copy of the source harness's live routing map)
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
- refuse to start if anything it would write inside the target goes through a symlink (a symlinked `.pi/agent`,
  `scripts/` or `tests/`, or a dangling link at a generated file), so it never writes outside the target. The target root
  may itself be a symlink, and a generated file that already exists through a link (for example `AGENTS.md -> CLAUDE.md`)
  is kept. Replace such a link with a real directory, or remove it, and run again. This covers the bootstrap step;
  `npm install` and the validators that `harness:install` runs afterwards use the target as it is (a symlinked
  `node_modules` is fine).
- give the target a pre-push gate for the harness: `npm run harness:check` (typecheck with `tsconfig.harness.json`, plus
  the harness unit and integration tests), the hook `.githooks/pre-push` (a target's own hook there is kept), and the
  harness runtime-state lines in `.gitignore` (missing lines are appended; a `.gitignore` that un-ignores harness paths is
  left alone). The harness only adds `harness:*` script names, so a target's own `check` or `test:integration` stays as
  it is. Enable the hook once per clone with `npm run harness:hooks:install`; it refuses to replace another hooks setup
  (husky, a global `core.hooksPath`, ...) unless run with `-- --force`. Tests that only exercise this repo's own fixtures
  (greenfield app fixtures, its initiatives, its model settings) are not shipped.

Limits of the installed gate:
- `harness:*` script names and `tsconfig.harness.json` belong to the harness. If a target already defines them, the
  install keeps the target's version and warns, and the gate then runs that version.
- The harness is ES modules: the target's `package.json` needs `"type": "module"`. The install warns if it says otherwise.
- The harness's code and tests share the target's `scripts/` and `tests/` folders, so `harness:check` also typechecks
  TypeScript there and runs any other `node:test` files in `tests/integration/`.
- Installing over an existing install is refused before anything is written (its files already exist); there is no
  in-place update yet.
- write or merge pi's project settings, `.pi/settings.json`. This file lists the harness extensions one by one; without it
  pi loads none of them (no `safe-bash`, no `till-done`). Existing settings are kept: the harness entries are appended
  to `extensions`/`skills`/`prompts`, other keys are only added when missing, and entries whose path is not in the target
  are skipped with a warning.
- write `.pi/agent/package/installed-package.json`

## After bootstrap
Review these files before normal use:
- `AGENTS.md`
- `SYSTEM.md`
- `.pi/APPEND_SYSTEM.md`
- `.pi/settings.json`
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
