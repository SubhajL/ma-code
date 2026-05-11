## Discovery Path
- Loaded `g-planning`, `g-coding`, and repo Pi log convention.
- Auggie discovery timed out; used local source inspection fallback.
- Inspected `logs/CURRENT.md`, `README.md`, `.pi/agent/extensions/afk-orchestration.ts`, `tests/extension-units/afk-orchestration.test.ts`, `docs/initiatives/greenfield-scaffold/issues.json`, `docs/initiatives/greenfield-scaffold/source/approved-g-issues.json`, and `docs/initiatives/greenfield-scaffold/slices/issue-005.summary.json`.

## Goal
- Semantically undo the premature issue-005 approval.
- Add harness checks so HITL approvals require the declared review artifacts to exist before the approval is considered satisfied.
- Create the missing navigation artifact so issue-005 can be re-presented for real approval.

## Non-Goals
- Do not redesign AFK orchestration beyond HITL approval validation.
- Do not auto-approve issue-005 again in this change set.
- Do not implement downstream AFK issues in this task.

## Assumptions
- For HITL issues, declared artifact paths should be derived from issue path metadata (`filesToModify`, plus other declared artifact-path arrays when present).
- Existing `status: approved|done` or durable AFK approval should not count if required review artifacts are missing.
- A specific human approval record should include `approvalRef`, `approvedBy`, `approvedAt`, and `note`.

## Cross-Model Check
- Used `second_model_plan`; kept the main-model plan and incorporated the helper's emphasis on validating required review artifacts before honoring HITL approvals.

## Plan Draft A
- Convert AFK HITL approval evaluation to check required artifacts asynchronously during issue evaluation.
- Treat missing artifacts as a skipped/blocked HITL state with explicit reasons listing missing paths and required approval ask.
- Remove the premature issue-005 approval artifact, add `navigation.md`, test the new gating, and land the fix.

## Plan Draft B
- Precompute required artifact existence in load/discovery, keep evaluation mostly synchronous, and surface a structured approval prompt reason for every unsatisfied HITL issue.
- Also require approval context fields (`approvedBy`, `approvedAt`, `note`) for durable approvals to count.

## Unified Plan
- Extend `AfkIssueArtifact` with optional artifact-path arrays used by Phase A summaries (`schemaPaths`, `migrationPaths`, `configPaths`, `testPaths`, `fixturePaths`).
- Add helper(s) in `afk-orchestration.ts` to:
  - collect declared approval artifact paths for HITL issues
  - validate durable approval context fields
  - resolve/list missing artifacts on disk
  - generate explicit approval prompts listing review artifacts
- Make issue evaluation async and require, for HITL issues:
  - dependencies resolved
  - required review artifacts exist
  - specific approval context present if a durable approval is used
- Semantically undo issue-005 approval by removing it from `docs/initiatives/greenfield-scaffold/afk-approvals.json`.
- Create `docs/initiatives/greenfield-scaffold/navigation.md` as the actual review artifact for issue-005.
- Add/adjust unit tests for:
  - durable approval rejected when required artifact is missing
  - durable approval accepted when artifact exists and approval context is complete
  - skipped HITL reasons include specific approval instructions and artifact listing
- Update README Phase B wording to reflect artifact-backed HITL approval validation.

## Files to Modify
- `.pi/agent/extensions/afk-orchestration.ts`
- `tests/extension-units/afk-orchestration.test.ts`
- `README.md`
- `docs/initiatives/greenfield-scaffold/afk-approvals.json`
- `logs/CURRENT.md`
- `logs/coding/2026-05-11_hitl-approval-artifact-validation.md`
- `reports/planning/2026-05-11_hitl-approval-artifact-validation-plan.md`

## New Files
- `docs/initiatives/greenfield-scaffold/navigation.md`

## TDD Sequence
- Add/adjust unit tests that fail because AFK orchestration currently accepts a durable HITL approval even when the declared review artifact is missing.
- Add/adjust unit tests that fail because approval prompts do not yet enumerate required artifacts and missing files.
- Implement the smallest async approval-validation helpers and wire them into HITL issue evaluation.
- Re-run targeted AFK orchestration tests until GREEN.
- Add the real navigation artifact and remove the premature approval artifact.
- Re-run targeted tests and cheap repo checks.

## Test Coverage
- `node --import tsx --test tests/extension-units/afk-orchestration.test.ts`
- `npm --silent run harness:afk-orchestrate -- dry-run --initiative greenfield-scaffold --max-parallel 3 --json`
- `git diff --check`

## Acceptance Criteria
- HITL issue evaluation no longer treats issue-005 as satisfied when `navigation.md` is missing.
- HITL skipped/deferred reasons list the required artifact path(s) and request specific approval.
- Durable AFK approvals require explicit context fields (`approvalRef`, `approvedBy`, `approvedAt`, `note`) to count.
- `docs/initiatives/greenfield-scaffold/navigation.md` exists as the artifact to review for issue-005.
- The premature issue-005 approval artifact is removed from main through a follow-up commit.

## Wiring Checks
- Runtime entry point: `scripts/harness-afk-orchestrate.ts`
  - Verification: dry-run shows issue-005 blocked/skipped until artifact exists and approval is present.
- Approval loader: `.pi/agent/extensions/afk-orchestration.ts` durable approval parsing
  - Verification: tests cover missing context and missing artifact paths.
- Initiative artifact path: `docs/initiatives/greenfield-scaffold/navigation.md`
  - Verification: dry-run reasons change when the file exists vs missing.

## Validation
- Run targeted AFK unit tests first.
- Run AFK dry-run against `greenfield-scaffold` to confirm issue-005 is no longer auto-satisfied by missing-artifact approval.
- Review staged diff with `g-check` style skepticism before PR.
- Create PR, wait for compact CI success, merge, and sync local main.

## Risks
- Making issue evaluation async touches a core Phase B path; keep changes localized.
- Other existing approval artifacts could fail new stricter validation if they lack context fields; keep the rule scoped to durable AFK approvals only.
- README wording could drift if the runtime behavior changes without the doc update.

## Pi Log Update
- Planning log: `reports/planning/2026-05-11_hitl-approval-artifact-validation-plan.md`
- Coding log: `logs/coding/2026-05-11_hitl-approval-artifact-validation.md`
- `logs/CURRENT.md` points to this pair during implementation.
