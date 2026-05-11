# HITL Approval Artifact Validation

## 2026-05-11T09:40:00+07:00

### Goal
- Prevent premature HITL approvals when required review artifacts are missing.
- Correct the issue-005 approval state and create the missing navigation review artifact.

### Discovery
- Loaded `g-planning` and `g-coding` guidance.
- Inspected AFK orchestration approval loading/evaluation, AFK tests, issue-005 materialized artifacts, and current README Phase B documentation.

### RED Evidence
- pending

### GREEN Evidence
- pending

### Wiring Notes
- pending

### Review Notes
- pending

## 2026-05-11T10:05:00+07:00

### RED Evidence
- Command: `node --import tsx --test tests/extension-units/afk-orchestration.test.ts`
- Result: failed after the new tests were added because `buildRun` still called `await evaluateIssues(...)` from a non-async function and because existing unit fixtures lacked required HITL review artifacts for already-done issue-001 cases.

### GREEN Evidence
- Command: `node --import tsx --test tests/extension-units/afk-orchestration.test.ts`
- Result: passed after making `buildRun` async, adding HITL approval artifact/context validation helpers, and fixing test fixtures to provide the expected review artifacts.
- Command: `npm --silent run harness:afk-orchestrate -- dry-run --initiative greenfield-scaffold --max-parallel 3 --json`
- Result: issue-001 remains done, issue-005 is no longer auto-approved, and the dry-run now asks for specific review/approval of `docs/initiatives/greenfield-scaffold/navigation.md`.

### Wiring Notes
- `afk-orchestration.ts` now treats durable HITL approvals as valid only when declared review artifacts exist and approval context (`approvedBy`, `approvedAt`, `note`) is complete.
- `docs/initiatives/greenfield-scaffold/navigation.md` is now the concrete review artifact for issue-005.
- `docs/initiatives/greenfield-scaffold/afk-approvals.json` is removed in this branch to semantically undo the premature approval.

### Review Notes
- Pending final `g-check` style diff review after staging.

## Review (2026-05-11T10:15:00+07:00) - working-tree

### Reviewed
- Repo: /Users/subhajlimanond/dev/ma-code
- Branch: task/task-1778467538269-fix-hitl-approval-artifact-checks-and-correct-is
- Scope: working-tree
- Commands Run:
  - `git diff --check`
  - `node --import tsx --test tests/extension-units/afk-orchestration.test.ts`
  - `npm --silent run harness:afk-orchestrate -- dry-run --initiative greenfield-scaffold --max-parallel 3 --json`
  - `git diff -- .pi/agent/extensions/afk-orchestration.ts tests/extension-units/afk-orchestration.test.ts README.md docs/initiatives/greenfield-scaffold/afk-approvals.json docs/initiatives/greenfield-scaffold/foundation-contract.md docs/initiatives/greenfield-scaffold/navigation.md logs/CURRENT.md logs/coding/2026-05-11_hitl-approval-artifact-validation.md reports/planning/2026-05-11_hitl-approval-artifact-validation-plan.md`

### Findings
CRITICAL
- none

HIGH
- none

MEDIUM
- none

LOW
- Foundation contract backfill is intentionally lightweight; if a richer historical artifact is desired later, it can be expanded without changing the new HITL approval guard.

### Open Questions / Assumptions
- Assumes durable AFK approval context should require `approvedBy`, `approvedAt`, and `note` for specificity.
- Assumes issue-001 should remain treated as approved once its artifact exists, rather than forcing retroactive human re-approval.

### Recommended Tests / Validation
- `node --import tsx --test tests/extension-units/afk-orchestration.test.ts`
- `npm --silent run harness:afk-orchestrate -- dry-run --initiative greenfield-scaffold --max-parallel 3 --json`
- `git diff --check`

### Rollout Notes
- After merge, re-ask for explicit approval of issue-005 against `docs/initiatives/greenfield-scaffold/navigation.md`.
- Do not restore `afk-approvals.json` for issue-005 until the user explicitly approves the artifact.

### Review Verdict
- Review Verdict: `no_required_fixes`
