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
- runtime state templates/placeholders (live runtime state is local-only and ignored)
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
- generated local-only runtime state files
- live runtime extensions:
  - `.pi/agent/extensions/safe-bash.ts`
  - `.pi/agent/extensions/till-done.ts`
- live task tool:
  - `task_update`
- validation runbook and validation script
- executable team-activation resolver and activation policy
- executable task-packet generator, packet policy, and packet schema
- executable handoff generator, handoff policy, and handoff schema
- optional `graphifyEvidence` metadata on generated task packets and handoffs for Graphify-backed or architecture-review proof context
- validator checks in `task_update` can consume structured `graphifyEvidence` orchestration evidence as graph query/freshness and source-verification proof
- executable recovery policy and runtime decision surfaces for bounded retry/rollback/stop recommendations before queue automation
- bounded queue execution via `run_next_queue_job` plus explicit multi-step sessions via `run_bounded_queue_session` in `.pi/agent/extensions/queue-runner.ts` (`run_queue_once` remains as a compatibility alias)
- file-backed scheduled workflow definitions plus explicit due-work inspection/materialization via `scripts/harness-scheduled-workflows.ts`
- file-backed package/bootstrap scaffolding via `.pi/agent/package/harness-package.json` and `scripts/harness-package.ts`
- same-runtime probe bridge for shared model/account-path child sessions
- executable discovery-policy selector helper via `.pi/agent/extensions/discovery-policy.ts` / `select_discovery_policy`
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
- local-only generated runtime bookkeeping under `.pi/agent/state/runtime/` and `logs/harness-actions.jsonl`
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
- discovery policy: `.pi/agent/docs/discovery_policy.md`
- Graphify adapter and runtime command: `.pi/agent/docs/graphify_adapter.md` (`.pi/agent/extensions/graphify-orchestrator.ts` / `run_graphify_orchestration` delegates to `graphify_adapter`)
- validation architecture: `.pi/agent/docs/validation_architecture.md`
- architecture/roadmap alignment boundary map: `.pi/agent/docs/architecture_roadmap_alignment.md`
- bounded autonomy architecture: `.pi/agent/docs/bounded_autonomy_architecture.md`
- phase capability map: `.pi/agent/docs/harness_phase_capability_map.md`
- architecture review workflow: `.pi/agent/docs/architecture_review_workflow.md`
- Graphify optional discovery/research policy: `.pi/agent/docs/graphify_discovery_research.md`
- Graphify final runbook/checklist: `.pi/agent/docs/graphify_final_runbook.md`
- product planning workflow: `.pi/agent/docs/product_planning_workflow.md`
- behavior-first TDD workflow: `.pi/agent/docs/tdd_behavior_first_workflow.md`
- deep-module refactoring workflow: `.pi/agent/docs/deep_module_refactoring_workflow.md`
- architecture/drift review artifacts:
  - `.pi/agent/prompts/templates/request-architecture-review.md`
  - `.pi/agent/prompts/templates/assess-drift-capability.md`
  - `.pi/agent/prompts/templates/propose-migration-path.md`

## Graphify evidence lifecycle drift guard
The Graphify evidence lifecycle is: explicit research queue-session orchestration -> graphifyEvidence in packet/handoff -> task_update validator consumption.
This lifecycle is bounded: metadata is optional, there is no global mandatory Graphify, no Graphify CLI --watch, daemon, or background behavior, and source verification remains required.

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
  - scan validator reports in this order: `Summary Table` -> `Final Decision` -> `Detailed Results`
- current coding log pointer: `logs/CURRENT.md`
- local semantic fixture validator for HARNESS-051 slice 1: `scripts/validate-prompt-semantics.sh`
- bounded live-proof wrapper for HARNESS-051 slice 2: `scripts/validate-prompt-semantics-live.sh`
- semantic fixture inventory: `.pi/agent/validation/prompt-semantics.json`
- canonical Graphify validator: `scripts/validate-graphify-discovery.sh` (covers adapter proof plus discovery-policy selector coverage for Graphify fallback choices; `--smoke` adds one explicit installed-CLI proof)

Direct repo-root operator/package ergonomics:
```bash
npm install --no-package-lock
npm run harness:status
npm run harness:queue-session -- --scope "bounded queue operation" --max-steps 3
npm run harness:schedules
npm run harness:package
npm run harness:worktree -- status
npm run harness:pr-gate -- --pr 63 --max-attempts 20
npm run harness:sync-main
npm run test:queue-runner
npm run test:core-workflows
npm run test:operator-surface
npm run test:queue-session
npm run test:scheduled-workflows
npm run test:worktree-helper
npm run test:pr-gate
npm run test:sync-main
npm run test:harness-package
npm run validate:core-workflows
npm run validate:graphify-discovery
npm run validate:prompt-contracts
npm run validate:prompt-semantics
npm run validate:prompt-semantics:live
npm run validate:harness-package
```

Bounded queue-session examples:
```bash
npm run harness:queue-session -- --scope "bounded queue operation" --max-steps 3
npm run harness:queue-session:json -- --scope "bounded queue operation" --max-steps 3 --max-runtime-seconds 30
node --import tsx scripts/harness-queue-session.ts --scope "bounded queue operation" --max-steps 2 --recent 3
```

That session summary now includes:
- explicit research-job Graphify orchestration evidence when a queued research job sets `graphifyOrchestration.enabled: true`
- duration and action counts
- started/finalized/blocked job IDs touched during the session
- remaining queued work count
- a recommended next action with operator-triage reasoning

Bounded scheduled workflow examples:
```bash
npm run harness:schedules
npm run harness:schedules:json
node --import tsx scripts/harness-scheduled-workflows.ts materialize --workflow repo-audit-run
node --import tsx scripts/harness-scheduled-workflows.ts materialize --workflow repo-audit-run --apply
```

Safe local main sync examples:
```bash
npm run harness:sync-main
npm run harness:sync-main:json
node --import tsx scripts/harness-sync-main.ts --json
```

The sync helper performs only a fast-forward update of local `main` from `origin/main`, preserves ignored runtime bookkeeping, and blocks when non-bookkeeping tracked dirt is present.

Harness package/bootstrap examples:
```bash
npm run harness:package
npm run harness:package:json
node --import tsx scripts/harness-package.ts bootstrap --dest /path/to/target-repo
```

See also:
- `.pi/agent/docs/harness_packaging_strategy.md`
- `.pi/agent/docs/harness_package_install.md`

Bounded worktree helper examples:
```bash
npm run harness:worktree -- branch-name --id HARNESS-024 --slug "worktree helpers"
npm run harness:worktree -- create --id HARNESS-024 --slug "worktree helpers"
npm run harness:worktree -- review-prep --path ../ma-code-worktrees/harness-024-worktree-helpers
npm run harness:worktree -- cleanup --path ../ma-code-worktrees/harness-024-worktree-helpers
```

PR CI/security gate helper examples:
```bash
npm run harness:pr-gate -- --pr 63 --max-attempts 20
npm run harness:pr-gate:json -- --pr 63 --once
```

The PR gate helper polls `gh pr checks` without `--watch`; default polling waits 180 seconds between attempts and reports CI/security checks plus review/comment triage.

Operator docs:
- `.pi/agent/docs/operator_manual.md`
- `.pi/agent/docs/operator_quickstart.md`
- `.pi/agent/docs/operator_workflow.md`
- `.pi/agent/docs/operator_install_guide.md`

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
  - repo static checks (including executable prompt/template contract validation)
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
