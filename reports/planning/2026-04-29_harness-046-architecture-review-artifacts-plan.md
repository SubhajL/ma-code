# Planning Log — harness-046-architecture-review-artifacts

- Date: 2026-04-29
- Scope: Add concrete reusable architecture/drift review artifacts, wire them into docs, and enforce their presence/basic wiring with static validation.
- Status: ready
- Related coding log: `logs/coding/2026-04-29_harness-046-architecture-review-artifacts.md`

## Goal
- Reduce architecture-review drift risk by adding reusable request/assessment/migration templates with static wiring proof.

## Scope
- Add three prompt-entry templates:
  - architecture review request
  - drift/capability assessment
  - migration-path proposal
- Wire them into architecture/validation/docs surfaces.
- Extend static validation so missing files or broken basic references fail fast.

## Files to Create or Edit
- `logs/CURRENT.md`
- `logs/coding/2026-04-29_harness-046-architecture-review-artifacts.md`
- `reports/planning/2026-04-29_harness-046-architecture-review-artifacts-plan.md`
- `.pi/agent/prompts/templates/request-architecture-review.md`
- `.pi/agent/prompts/templates/assess-drift-capability.md`
- `.pi/agent/prompts/templates/propose-migration-path.md`
- `.pi/agent/validation/prompt-contracts.json`
- `.pi/agent/docs/architecture_review_workflow.md`
- `.pi/agent/docs/validation_architecture.md`
- `.pi/agent/docs/file_map.md`
- `README.md`
- `scripts/check-repo-static.sh`

## Why Each File Exists
- template files: reusable, concrete review artifacts.
- prompt-contract inventory: exact-header/static presence enforcement for the new templates.
- architecture/validation/file-map/readme docs: visible operator/reviewer wiring.
- repo-static script: prove presence/basic reference wiring automatically.
- paired logs: bounded evidence for this task.

## What Logic Belongs There
- template files should define exact reusable output structure only.
- docs should explain when to use the templates and where they live.
- static checks should prove file existence and basic doc wiring, not semantic quality.

## What Should Not Go There
- no runtime/orchestration behavior changes.
- no broader prompt-role redesign.
- no live-provider validation requirement.

## Dependencies
- Active task: `task-1777451493170`
- Clean dedicated worktree: `/Users/subhajlimanond/dev/ma-code-worktrees/task-1777451493170-harness-046-architecture-review-artifacts`

## Acceptance Criteria
- The three reusable artifacts exist under `.pi/agent/prompts/templates/`.
- Docs reference the artifacts clearly.
- Static validation fails if the artifacts are missing or their basic wiring/reference contract breaks.
- Change lands via PR and local main syncs to the merged commit.

## Likely Failure Modes
- Templates exist but are not wired into the prompt-contract inventory.
- Docs mention the architecture workflow generally but not the new artifacts specifically.
- Static checks prove file existence only and miss reference wiring.
- Scope drifts into broader prompt/role behavior changes.

## Validation Plan
- `bash scripts/validate-prompt-contracts.sh`
- `bash scripts/check-repo-static.sh`
- `git diff --check`
- PR checks

## Recommended Next Step
- Implement the three templates first, then wire prompt contracts, then update docs, then add the bounded repo-static assertions so the final validation path proves both presence and basic wiring.
