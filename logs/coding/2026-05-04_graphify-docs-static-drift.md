# Coding Log: Graphify Docs Static Drift Checks

## Work Summary (2026-05-04 local) - planning and discovery

### Goal
- Add docs/static checks that prevent drift across Graphify orchestration, evidence metadata, and validator consumption docs/runtime surfaces.

### Files Changed and Why
- `reports/planning/2026-05-04_graphify-docs-static-drift-plan.md`: g-planning plan.
- `logs/coding/2026-05-04_graphify-docs-static-drift.md`: active coding evidence log.
- `logs/CURRENT.md`: active log pointer.

### Tests Added or Changed
- none yet.

### RED Evidence
- none yet; next step is static-check RED by adding assertions before docs.

### GREEN Evidence
- none yet.

### Other Validation Commands
- Root status check confirmed clean synced main before worktree creation.
- Auggie discovery timed out; local fallback discovery used.

### Wiring Verification
- Static guard target: `scripts/check-repo-static.sh`.
- Docs target: README and Graphify/operator/queue/team/validation docs.

### Behavior Changes and Risk Notes
- Planned change is docs/static only; no runtime behavior or Graphify execution.

## Work Summary (2026-05-04 local) - RED/GREEN docs static drift guard

### Goal
- Add docs/static drift checks that keep the Graphify lifecycle consistent across orchestration, evidence metadata, and validator consumption docs.

### Files Changed and Why
- `scripts/check-repo-static.sh`: added a Graphify lifecycle drift-guard assertion block for canonical title, lifecycle contract, optional/no-global/no-watch/source-verification safety language across docs.
- `README.md`: added canonical `Graphify evidence lifecycle drift guard` section.
- `.pi/agent/docs/operator_workflow.md`: added lifecycle guard in cross-phase workflow context.
- `.pi/agent/docs/queue_semantics.md`: tied explicit research `graphifyOrchestration` queue-session behavior to downstream evidence/validation lifecycle.
- `.pi/agent/docs/team_orchestration_architecture.md`: tied packet/handoff `graphifyEvidence` metadata to the lifecycle.
- `.pi/agent/docs/validation_architecture.md`: tied validator consumption to the lifecycle.
- `.pi/agent/docs/graphify_adapter.md`: tied adapter/orchestrator docs to lifecycle and safety boundaries.
- `.pi/agent/docs/graphify_final_runbook.md`: tied final checklist to lifecycle and safety boundaries.

### Tests Added or Changed
- Static checker assertions only; no runtime tests added because this slice is docs/static drift prevention.

### RED Evidence
- `bash scripts/check-repo-static.sh` failed after adding the static assertion block and before docs updates with `AssertionError: README.md missing Graphify lifecycle drift guard title`.

### GREEN Evidence
- `bash scripts/check-repo-static.sh` passed after docs updates with `prompt-contract-validation: PASS (29 prompt files checked)` and `repo-static-checks-ok`.
- Repeated static check after broader validators also passed.

### Other Validation Commands
- `git diff --check` passed with no output.
- `bash scripts/check-foundation-extension-compile.sh` passed with `foundation-extension-compile-ok`.
- `bash scripts/validate-graphify-discovery.sh --report /tmp/graphify-docs-static-drift-graphify.md --summary-json /tmp/graphify-docs-static-drift-graphify.json` passed with `graphify-discovery-validation: PASS`.
- `bash scripts/validate-extension-unit-tests.sh --report /tmp/graphify-docs-static-drift-ext.md --summary-json /tmp/graphify-docs-static-drift-ext.json` passed with `Extension unit-test validation PASS`.
- `bash scripts/validate-core-workflows.sh --report /tmp/graphify-docs-static-drift-core.md --summary-json /tmp/graphify-docs-static-drift-core.json` passed with `core-workflows-validation: PASS`.

### Wiring Verification
- Static checker now reads README plus operator, queue, team, validation, Graphify adapter, and Graphify final runbook docs and asserts the lifecycle drift guard title, contract, and safety boundaries.
- The asserted lifecycle string is: `explicit research queue-session orchestration -> graphifyEvidence in packet/handoff -> task_update validator consumption`.

### Behavior Changes and Risk Notes
- Docs/static only; no runtime behavior changed.
- Static strings are intentionally exact enough to catch drift but short enough to keep maintenance bounded.

## Review (2026-05-04 local) - working-tree

### Reviewed
- Repo: `/Users/subhajlimanond/dev/ma-code-worktrees/task-1777888435970-graphify-docs-static-drift`
- Branch: `split/task-1777888435970-graphify-docs-static-drift`
- Scope: working-tree
- Commands Run:
  - `git status --short --branch`
  - `git diff --stat`
  - `git diff -- scripts/check-repo-static.sh README.md .pi/agent/docs/operator_workflow.md .pi/agent/docs/queue_semantics.md .pi/agent/docs/team_orchestration_architecture.md .pi/agent/docs/validation_architecture.md .pi/agent/docs/graphify_adapter.md .pi/agent/docs/graphify_final_runbook.md`
  - `rg -n -- "Graphify evidence lifecycle drift guard|explicit research queue-session orchestration -> graphifyEvidence in packet/handoff -> task_update validator consumption|metadata is optional|no global mandatory Graphify|no Graphify CLI --watch, daemon, or background behavior|source verification remains required" ...`
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
- Assumes exact static strings are acceptable for a drift guard because they are short and canonical.
- Assumes duplicating the lifecycle sentence in the key docs is preferable to a link-only strategy for static drift detection.

### Recommended Tests / Validation
- Completed RED/GREEN static check, repeated static check, foundation compile, extension-unit validator, Graphify discovery validator, core workflow validator, and `git diff --check`.

### Rollout Notes
- Future Graphify lifecycle changes should update the canonical lifecycle phrase in `scripts/check-repo-static.sh` and all asserted docs in the same PR.
