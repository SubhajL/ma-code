# Planning Log — full-chain-harness-phase-8

- Date: 2026-05-07
- Scope: Merge/release policy and bounded harness merge helper
- Status: in_progress
- Branch: `split/task-1778143204032-phase-8-merge-helper`

## Goal
- Add a bounded, explicit, policy-gated merge helper that checks lifecycle and PR gate readiness before applying a PR merge, with optional explicit local main sync.

## Acceptance Criteria
- Machine-readable merge/release policy exists at `.pi/agent/release/merge-release-policy.json`.
- Human-readable policy doc exists at `.pi/agent/docs/merge_release_policy.md`.
- `scripts/harness-merge.ts check --pr <N>` reports ready/blocked with exact blockers.
- `scripts/harness-merge.ts apply --pr <N>` re-checks readiness before merging.
- Apply blocks on missing lifecycle merge-ready, PR gate not pass, draft PR, requested changes/blocking comments, dirty local repo, and invalid method.
- `--sync-main` is optional and explicit only.
- `harness:pr-gate`, `harness:sync-main`, and `g-submit` remain standalone and non-merging by default.
- Required checks pass: merge-helper unit/integration tests, dedicated validator, and core-workflows validator.

## TDD Slice
- First tracer behavior: check mode reports blocked when lifecycle is not merge-ready or PR gate is not pass.
- Public interface: `scripts/harness-merge.ts` exported policy/readiness/apply helpers and CLI.
- Boundary fakes: fake command runner for `gh`/`git`, fake lifecycle assessment, fake PR gate session, fake sync-main result.
- Out of scope: deployment, tagging, changelog publishing, hidden auto-merge, conflict auto-resolution.

## Validation Plan
- `node --import tsx --test tests/extension-units/merge-helper.test.ts`
- `node --import tsx --test tests/integration/merge-helper.test.ts`
- `./scripts/validate-merge-helper.sh`
- `./scripts/validate-core-workflows.sh`
- PR gate, merge, and sync local root main after checks are green.
