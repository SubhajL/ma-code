# Planning Log — full-chain-harness-phase-0-slice-2

- Date: 2026-05-06
- Scope: Add a bounded initiative bootstrap helper for `docs/initiatives/<feature-slug>/` after Phase 0 Slice 1 landed the durable templates.
- Status: ready
- Related coding log: `logs/coding/2026-05-06_full-chain-harness-phase-0-slice-2.md`

## Goal
- Add a repo-local helper that creates `docs/initiatives/<feature-slug>/prd.md`, `backlog.md`, and `decisions.md` from the durable `docs/initiatives/TEMPLATE/` files.
- Land the slice through the standard worktree → PR → merge → root-`main` sync path.

## Scope
- Add a new bounded CLI/helper under `scripts/` for initiative bootstrap.
- Add RED/GREEN integration coverage for create-success, duplicate-target refusal, missing-template failure behavior, and optional informational next-step guidance output.
- Wire package aliases/docs/static validation so the helper is discoverable in both this repo and freshly bootstrapped target repos.

## Files to Create or Edit
- `scripts/harness-init-feature.ts`
- `tests/integration/harness-init-feature.test.ts`
- `package.json`
- `.pi/agent/package/templates/package.template.json`
- `tests/integration/harness-package.test.ts`
- `scripts/validate-harness-package.sh`
- `scripts/check-repo-static.sh`
- `README.md`
- `.pi/agent/docs/harness_package_install.md`
- `.pi/agent/docs/operator_install_guide.md`
- `.pi/agent/docs/product_planning_workflow.md`

## Why Each File Exists
- `scripts/harness-init-feature.ts`: bounded helper and CLI surface for initiative scaffold creation.
- `tests/integration/harness-init-feature.test.ts`: behavior-first proof for success and refusal paths.
- `package.json` / `.pi/agent/package/templates/package.template.json`: add the operator-facing `harness:init-feature` alias in source and bootstrapped repos.
- `tests/integration/harness-package.test.ts`: prove the helper script/alias survives bootstrap into a fresh target repo.
- `scripts/validate-harness-package.sh`: include the new helper/test in the bounded package/bootstrap validator path.
- `scripts/check-repo-static.sh`: hold doc/script discoverability wiring in place.
- README/install/planning docs: document when and how to use the helper after bootstrap.

## What Logic Belongs There
- File-system-only initiative scaffold creation based on existing repo-local templates.
- Conservative refusal when the target initiative folder already exists or required templates are missing.
- Optional informational success output suggesting `g-grill`, `g-prd`, and `g-issues` as next planning steps.
- No hidden git, queue, runtime, or issue-tracker behavior.

## What Should Not Go There
- No PRD generation from prompts or AI output.
- No automatic task creation, queue enqueueing, or branch/worktree creation.
- No domain-doc bootstrap expansion beyond the initiative docs already defined in Slice 1.

## Dependencies
- `docs/initiatives/TEMPLATE/{prd,backlog,decisions}.md` landed in Phase 0 Slice 1.
- Existing package/bootstrap flow in `scripts/harness-package.ts` and `tests/integration/harness-package.test.ts`.
- Existing worktree/sync helpers in `scripts/harness-worktree.ts` and `scripts/harness-sync-main.ts` for landing.

## Acceptance Criteria
- Running the helper with a valid feature slug creates `docs/initiatives/<feature-slug>/prd.md`, `backlog.md`, and `decisions.md` from the repo-local templates.
- Running the helper when `docs/initiatives/<feature-slug>/` already exists fails clearly without overwriting files.
- Running the helper when required initiative templates are missing fails clearly.
- Successful human-readable helper output includes informational next-step suggestions for `g-grill`, `g-prd`, and `g-issues` without enforcing or auto-running them.
- Source repo and bootstrapped target repos expose a documented `harness:init-feature` command path.
- Targeted helper tests plus bounded package/static validators pass before review/merge.

## Likely Failure Modes
- Helper reads the wrong template root (`.pi/...templates` instead of repo-local `docs/initiatives/TEMPLATE`).
- Helper silently overwrites an existing initiative folder.
- Bootstrap/install docs mention the new helper but package aliases or validator wiring drift.
- Slug normalization or target-path checks allow invalid or surprising paths.

## Validation Plan
- RED/GREEN in `tests/integration/harness-init-feature.test.ts`.
- Update `tests/integration/harness-package.test.ts` for alias/bootstrap discoverability.
- Run `./scripts/validate-harness-package.sh`.
- Run `./scripts/check-repo-static.sh`.
- Run `./scripts/validate-core-workflows.sh` only if touched surfaces require broader workflow proof; otherwise keep to package/static checks.
- Run `git diff --check` and bounded review-prep before PR.

## Recommended Next Step
- Start with a failing integration test for create-success plus duplicate-target refusal, then implement the smallest `scripts/harness-init-feature.ts` surface that makes those tests pass.

## Clarification Checkpoint (2026-05-06)
- User clarified that the previously discussed slice plan sits under a broader Phase 0 umbrella, not as a standalone unrelated slice.
- Current understanding:
  - Phase 0 overall includes the durable planning/governance skeleton, intake policy, initiative template scaffold, and explicit feature bootstrap helper.
  - Slice 1 already landed the durable docs scaffold and intake-policy/template bootstrap.
  - Slice 2 is the remaining bounded helper/discoverability work around `scripts/harness-init-feature.ts` and its validation/docs wiring.
- Clarification resolved:
  - proceed with only the remaining Slice 2 delta
  - do not reopen or re-log already landed Slice 1 work as pending implementation
- Recommended next skill after clarification:
  - `g-planning` for the concrete Slice 2 implementation/landing plan
- Additional clarification (2026-05-06):
  - user prefers Slice 2 to include optional helper output that suggests the next product-planning skills:
    - `g-grill`
    - `g-prd`
    - `g-issues`
  - treat that guidance as informational output, not as runtime enforcement or automatic workflow execution
