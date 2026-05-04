# Coding Log: Validator Graphify Orchestration Evidence

## Work Summary (2026-05-04 local) - planning and discovery

### Goal
- Add validator checks that consume structured Graphify orchestration evidence from `graphifyEvidence` metadata.

### Files Changed and Why
- `reports/planning/2026-05-04_validator-graphify-orchestration-evidence-plan.md`: g-planning plan.
- `logs/coding/2026-05-04_validator-graphify-orchestration-evidence.md`: active coding evidence log.
- `logs/CURRENT.md`: active log pointer.

### Tests Added or Changed
- none yet.

### RED Evidence
- none yet; next step is tests-first in `tests/extension-units/till-done.test.ts`.

### GREEN Evidence
- none yet.

### Other Validation Commands
- Root status check confirmed clean synced main before worktree creation.
- Auggie discovery timed out; local fallback discovery used.

### Wiring Verification
- Runtime validation entry point: `.pi/agent/extensions/till-done.ts` / `task_update action=validate`.
- Decision helper: `.pi/agent/extensions/graphify-validation-decision.ts` / `decideGraphifyValidation`.
- Existing proof carrier: `graphifyEvidence` on generated packets/handoffs.

### Behavior Changes and Risk Notes
- Planned change consumes structured metadata only; no Graphify execution or global mandatory policy.

## Work Summary (2026-05-04 local) - RED/GREEN validator Graphify evidence consumption

### Goal
- Let validator checks consume structured Graphify orchestration evidence via `task_update validate` without running Graphify or parsing free-form evidence.

### Files Changed and Why
- `.pi/agent/extensions/till-done.ts`: added `GraphifyEvidenceInput`, tool schema support, and `graphifyValidationFromEvidence` mapping into the existing `decideGraphifyValidation` helper.
- `tests/extension-units/till-done.test.ts`: added tests for Graphify-backed validation pass from orchestration evidence, block when source verification is missing, and explicit `graphifyValidation` precedence over `graphifyEvidence`.
- `.pi/agent/docs/validation_architecture.md` and `README.md`: documented that validator checks can consume structured orchestration evidence as Graphify proof.
- `scripts/check-repo-static.sh`: added code/docs static assertions for the new validator consumption wiring.
- Planning/coding logs and `logs/CURRENT.md`: recorded plan and evidence.

### Tests Added or Changed
- Added 3 `till-done` unit tests covering derived Graphify proof from orchestration evidence, missing source proof blocking, and precedence of explicit `graphifyValidation`.

### RED Evidence
- `bash scripts/validate-extension-unit-tests.sh --report /tmp/validator-graphify-red-ext.md --summary-json /tmp/validator-graphify-red-ext.json` failed before implementation.
- Relevant failures: `Graphify-backed acceptance consumes orchestration evidence during validation` returned the existing required-proof block reason instead of passing; `Graphify orchestration evidence still blocks when source verification is missing` returned `blocked` because graph query proof was not derived from evidence.

### GREEN Evidence
- `bash scripts/validate-extension-unit-tests.sh --report /tmp/validator-graphify-green1-ext.md --summary-json /tmp/validator-graphify-green1-ext.json` passed after implementation.
- `bash scripts/validate-extension-unit-tests.sh --report /tmp/validator-graphify-green2-ext.md --summary-json /tmp/validator-graphify-green2-ext.json` passed after docs/static updates.
- Final flake check: `bash scripts/validate-extension-unit-tests.sh --report /tmp/validator-graphify-final1-ext.md --summary-json /tmp/validator-graphify-final1-ext.json` and `...final2...` passed; together with `green2`, this gives 3 consecutive isolated extension-unit validator passes.

### Other Validation Commands
- `bash scripts/check-foundation-extension-compile.sh` passed with `foundation-extension-compile-ok`.
- `bash scripts/validate-core-workflows.sh --report /tmp/validator-graphify-core.md --summary-json /tmp/validator-graphify-core.json` passed with `core-workflows-validation: PASS`.
- `bash scripts/validate-graphify-discovery.sh --report /tmp/validator-graphify-discovery.md --summary-json /tmp/validator-graphify-discovery.json` passed with `graphify-discovery-validation: PASS`.
- `bash scripts/check-repo-static.sh` passed with `prompt-contract-validation: PASS (29 prompt files checked)` and `repo-static-checks-ok`.
- `git diff --check` passed with no output.

### Wiring Verification
- `TaskUpdateSchema` now accepts optional `graphifyEvidence`.
- `task_update validate` chooses explicit `graphifyValidation` first, then derives validation input from `graphifyEvidence`, then falls back to implicit required Graphify-backed acceptance placeholder.
- `graphifyValidationFromEvidence` maps `graphifyOrchestrationAction=query_graph` or `graphifyAdapterAction=query` to latest relevant graph queried proof, and `check_freshness`/`freshness` to freshness/cadence proof.
- Important claims source verification remains explicit via `importantClaimsSourceVerified: true`.
- Existing `decideGraphifyValidation` remains the single decision helper.

### Behavior Changes and Risk Notes
- No Graphify runtime execution was added.
- No Graphify `--watch`, daemon, background loop, or global mandatory policy was added.
- Explicit `graphifyValidation` takes precedence over `graphifyEvidence` to preserve current caller control.

## Review (2026-05-04 local) - working-tree

### Reviewed
- Repo: `/Users/subhajlimanond/dev/ma-code-worktrees/task-1777886304207-validator-graphify-orchestration-evidence`
- Branch: `split/task-1777886304207-validator-graphify-orchestration-evidence`
- Scope: working-tree
- Commands Run:
  - `git status --short --branch`
  - `git diff --stat`
  - `git diff -- .pi/agent/extensions/till-done.ts tests/extension-units/till-done.test.ts scripts/check-repo-static.sh README.md .pi/agent/docs/validation_architecture.md`
  - `rg -n -- "--watch|graphifyValidationFromEvidence|graphifyEvidence|graphifyOrchestrationAction|importantClaimsSourceVerified" ...`
  - validation commands listed above

### Findings
CRITICAL
- none

HIGH
- none

MEDIUM
- none

LOW
- none

### Open Questions / Assumptions
- Assumes `query_graph` / adapter `query` are acceptable structured evidence for latest relevant graph queried proof.
- Assumes source verification must stay explicit via `importantClaimsSourceVerified: true`; source verification notes alone are not accepted as proof.

### Recommended Tests / Validation
- Completed isolated extension-unit validator RED/GREEN, 3 consecutive final extension-unit passes, foundation compile, Graphify discovery validator, core workflows validator, static checks, and `git diff --check`.

### Rollout Notes
- Validator callers can continue using explicit `graphifyValidation`; it takes precedence over `graphifyEvidence`.
