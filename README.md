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
- same-runtime probe bridge for shared model/account-path child sessions
- validation reports and file map

Not yet implemented:
- live queue runner
- team orchestration runtime
- UI widgets / status components
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

## GitHub automation
This repo uses a harness-specific GitHub baseline rather than app-specific deployment pipelines.

Current GitHub workflow surfaces:
- CI: `.github/workflows/ci.yml`
  - repo static checks
  - foundation extension compile check
  - skill-routing validator
  - harness-routing validator
  - team-activation validator
  - task-packets validator
  - handoffs validator
  - same-runtime bridge validator
- Security: `.github/workflows/security.yml`
  - dependency review on PRs
  - CodeQL analysis for JavaScript/TypeScript
- Dependency updates: `.github/dependabot.yml`
