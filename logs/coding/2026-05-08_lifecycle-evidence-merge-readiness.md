# Lifecycle Evidence Merge Readiness

## 2026-05-08T00:00:00Z - Start

- Goal: implement worktree-safe lifecycle evidence so bounded merge helper can reach `merge_ready` for valid PRs without reading protected runtime JSON from a worktree.
- Active task: `task-1778227621984`.
- Discovery path: Auggie attempted and timed out; used local direct inspection of `slice-lifecycle.ts`, `harness-merge.ts`, lifecycle policy, and existing tests.
- First TDD tracer: lifecycle assessment with a valid evidence bundle reaches `merge_ready` even when no runtime task JSON exists.

## 2026-05-08T00:12:00Z - RED

- Added failing tests for lifecycle evidence bundles and merge-helper `--lifecycle-evidence` support.
- RED command: `TSX_IMPORT_PATH=/Users/subhajlimanond/dev/ma-code/node_modules/tsx/dist/loader.mjs node --import /Users/subhajlimanond/dev/ma-code/node_modules/tsx/dist/loader.mjs --test tests/extension-units/slice-lifecycle.test.ts tests/integration/slice-lifecycle.test.ts tests/integration/merge-helper.test.ts`.
- RED failures:
  - lifecycle evidence bundle ignored, current stage remained `intake_required`.
  - merge helper readiness stayed false when passed `lifecycleEvidenceFile`.
  - CLI rejected `--evidence-file` as unknown.

## 2026-05-08T00:35:00Z - GREEN implementation

- Files changed: `slice-lifecycle.ts`, `harness-slice-lifecycle.ts`, `harness-merge.ts`, lifecycle evidence schema, docs, validators, static checks, and lifecycle/merge tests.
- Behavior: `assessSliceLifecycle` can consume an explicit lifecycle evidence bundle and satisfy stages through `merge_ready` without protected runtime task JSON in the worktree; `harness:merge` accepts `--lifecycle-evidence` and still keeps PR gate/review/draft/dirty/merge-state blockers intact.
- GREEN commands:
  - `TSX_IMPORT_PATH=/Users/subhajlimanond/dev/ma-code/node_modules/tsx/dist/loader.mjs node --import /Users/subhajlimanond/dev/ma-code/node_modules/tsx/dist/loader.mjs --test tests/extension-units/slice-lifecycle.test.ts tests/integration/slice-lifecycle.test.ts tests/integration/merge-helper.test.ts` — 20/20 pass.
  - `TSX_IMPORT=/Users/subhajlimanond/dev/ma-code/node_modules/tsx/dist/loader.mjs TSX_IMPORT_PATH=/Users/subhajlimanond/dev/ma-code/node_modules/tsx/dist/loader.mjs ./scripts/validate-slice-lifecycle.sh` — pass.
  - `TSX_IMPORT=/Users/subhajlimanond/dev/ma-code/node_modules/tsx/dist/loader.mjs ./scripts/validate-merge-helper.sh` — pass.
  - `./scripts/check-repo-static.sh` — pass.
  - `./scripts/check-foundation-extension-compile.sh` — pass.
  - `./scripts/validate-core-workflows.sh --report /tmp/lifecycle-evidence-core-report.md --summary-json /tmp/lifecycle-evidence-core-summary.json` — pass.
  - `git diff --check` — pass.
- Wiring verification: CLI flags `--evidence-file` and `--lifecycle-evidence` are parsed; schema is required by static checks; validators compile helper/CLI and assert docs/static wiring.
- Risk notes: evidence bundles are additive and explicit; invalid review verdict or missing evidence still blocks lifecycle readiness.

## 2026-05-08T00:45:00Z - Hardening

- Added containment rule: explicit lifecycle evidence files must be repo-local JSON under `reports/lifecycle/`.
- Added unit coverage for rejected outside evidence path.
- Re-ran:
  - `TSX_IMPORT=/Users/subhajlimanond/dev/ma-code/node_modules/tsx/dist/loader.mjs TSX_IMPORT_PATH=/Users/subhajlimanond/dev/ma-code/node_modules/tsx/dist/loader.mjs ./scripts/validate-slice-lifecycle.sh` — pass, 9 unit tests and 6 integration tests.
  - `TSX_IMPORT=/Users/subhajlimanond/dev/ma-code/node_modules/tsx/dist/loader.mjs ./scripts/validate-merge-helper.sh` — pass.
  - `./scripts/check-repo-static.sh` — pass.
  - `./scripts/check-foundation-extension-compile.sh` — pass.
  - `./scripts/validate-core-workflows.sh --report /tmp/lifecycle-evidence-core-report.md --summary-json /tmp/lifecycle-evidence-core-summary.json` — pass.
  - `git diff --check` — pass.

## Review (2026-05-08T00:55:00Z) - working-tree

### Reviewed
- Repo: `/Users/subhajlimanond/dev/ma-code-worktrees/task-1778227621984-lifecycle-evidence-merge-readiness`
- Branch: `split/task-1778227621984-lifecycle-evidence-merge-readiness`
- Scope: working-tree
- Commands Run:
  - `git diff --name-only`
  - `git diff --stat`
  - `rg -n "gh pr merge|--watch|task_update|run_next_queue_job|state/runtime|\\.\." ...`
  - targeted diff inspection for `slice-lifecycle.ts` and `harness-merge.ts`
  - validators listed above

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
- Evidence bundles are explicit operator artifacts; this change consumes them but does not yet auto-export them from runtime task state.
- Real merge still depends on live GitHub PR gate and merge state checks in `harness:merge`.

### Recommended Tests / Validation
- Already run: slice lifecycle validator, merge helper validator, repo static checks, foundation compile, core workflows, and diff whitespace check.

### Rollout Notes
- Operators can pass `--lifecycle-evidence reports/lifecycle/<task-id>.merge-evidence.json` to `harness:merge` for isolated worktree runs.
- Evidence path containment prevents outside-file ingestion.

Review Verdict: no_required_fixes

## Creation (2026-05-08T01:05:00Z)

- Branch: 
- Commit: 
- Lifecycle evidence file created: 
- Purpose: allow worktree-safe lifecycle assessment through /later PR stages without protected runtime task JSON in the worktree.

