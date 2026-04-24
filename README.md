# Repo-Local Pi Harness — GPT-5.4 First

This pack is reorganized so that the Pi-specific harness assets live **inside each repo that uses them**.

## Root-level files
Keep these at repo root so Pi can discover them as project instructions:
- `AGENTS.md`
- `SYSTEM.md`

## Repo-local Pi harness files
Everything else lives under:
- `.pi/agent/...`

This includes:
- prompts
- templates
- routing docs
- models/settings
- team definitions
- state schemas
- runtime state placeholders
- extension specs
- skills
- harness docs

## Current status
This is a **repo-local harness foundation with first live runtime controls**, not a finished full harness.

Implemented here:
- GPT-5.4-first policy split
- repo-local Pi folder structure
- revised role files
- revised templates
- normalized routing config with verified runnable IDs
- team files
- task and queue schemas
- live runtime state files
- live runtime extensions:
  - `.pi/agent/extensions/safe-bash.ts`
  - `.pi/agent/extensions/till-done.ts`
- live task tool:
  - `task_update`
- validation runbook and validation script
- executable team-activation resolver and activation policy
- executable task-packet generator, packet policy, and packet schema
- executable handoff generator, handoff policy, and handoff schema
- executable recovery policy and runtime decision surfaces for bounded retry/rollback/stop recommendations before queue automation
- bounded single-runner queue execution via `run_next_queue_job` in `.pi/agent/extensions/queue-runner.ts` (`run_queue_once` remains as a compatibility alias)
- file-backed scheduled workflow definitions plus explicit due-work inspection/materialization via `scripts/harness-scheduled-workflows.ts`
- same-runtime probe bridge for shared model/account-path child sessions
- task-class-aware validation checklist logic and proof-based completion gates in `till-done.ts`
- validation reports and file map

Not yet implemented:
- a free-running queue daemon or hidden scheduled workflow loop
- broader team orchestration runtime beyond deterministic activation, packets, handoffs, recovery, and one-step queue advancement
- rich UI widgets / dashboard components beyond the lightweight CLI status surface
- broader automated test suite beyond bounded runtime validation

## Roadmap status
Current implementation is best understood as the **first validated Phase A/B foundation slice**.
That means the repo currently has:
- repo-local harness structure
- role/prompt foundation
- task and queue schemas as state artifacts
- first live runtime controls
- bounded validation workflow

It does **not** yet mean later roadmap phases are complete.
In particular:
- **Phase F** means structured team orchestration
- **Phase I** means bounded long-running autonomy
- **Phase J** is where bounded autonomy becomes much more practical to operate day to day

So Phase F should be read as:
- real multi-agent orchestration
- not yet “almost hands-free programming” by itself

Related docs:
- validation architecture: `.pi/agent/docs/validation_architecture.md`
- bounded autonomy architecture: `.pi/agent/docs/bounded_autonomy_architecture.md`
- phase capability map: `.pi/agent/docs/harness_phase_capability_map.md`

## Validation workflow
Use the validator script for repeatable Phase A/B checks:

```bash
cd /Users/subhajlimanond/dev/ma-code
./scripts/validate-phase-a-b.sh
```

Key outputs:
- runbook: `.pi/agent/docs/runtime_validation_runbook.md`
- operator workflow: `.pi/agent/docs/operator_workflow.md`
- validation reports: `reports/validation/`
- current coding log pointer: `logs/CURRENT.md`

Direct repo-root operator/package ergonomics:
```bash
npm install --no-package-lock
npm run harness:status
npm run harness:schedules
npm run harness:worktree -- status
npm run test:queue-runner
npm run test:core-workflows
npm run test:operator-surface
npm run test:scheduled-workflows
npm run test:worktree-helper
npm run validate:core-workflows
```

Bounded scheduled workflow examples:
```bash
npm run harness:schedules
npm run harness:schedules:json
node --import tsx scripts/harness-scheduled-workflows.ts materialize --workflow repo-audit-run
node --import tsx scripts/harness-scheduled-workflows.ts materialize --workflow repo-audit-run --apply
```

Bounded worktree helper examples:
```bash
npm run harness:worktree -- branch-name --id HARNESS-024 --slug "worktree helpers"
npm run harness:worktree -- create --id HARNESS-024 --slug "worktree helpers"
npm run harness:worktree -- review-prep --path ../ma-code-worktrees/harness-024-worktree-helpers
npm run harness:worktree -- cleanup --path ../ma-code-worktrees/harness-024-worktree-helpers
```

Operator quickstart:
- `.pi/agent/docs/operator_quickstart.md`
- `.pi/agent/docs/operator_workflow.md`

Dedicated core workflow validator:
```bash
./scripts/validate-core-workflows.sh
```

Thinking-first tuning report from bounded local timing/cost-ish evidence:
```bash
./scripts/collect-harness-tuning-data.sh
```

That report now combines:
- harness-routing validator timings
- queue-runner validator timings
- core workflow validator timings
- scheduled workflow dry-run helper timings
- role-level cost-ish index summaries from `.pi/agent/models.json`

## GitHub automation
This repo uses a harness-specific GitHub baseline rather than app-specific deployment pipelines.

Current GitHub workflow surfaces:
- CI: `.github/workflows/ci.yml`
  - repo static checks
  - foundation extension compile check
  - queue-semantics validator
  - skill-routing validator
  - harness-routing validator
  - team-activation validator
  - task-packets validator
  - handoffs validator
  - same-runtime bridge validator
  - recovery-policy validator
  - recovery-runtime validator
  - queue-runner validator (`--skip-live` in CI; local/operator runs attempt one bounded live probe by default when possible)
  - core-workflows validator
- Security: `.github/workflows/security.yml`
  - dependency review on PRs
  - CodeQL analysis for JavaScript/TypeScript
- Dependency updates: `.github/dependabot.yml`
