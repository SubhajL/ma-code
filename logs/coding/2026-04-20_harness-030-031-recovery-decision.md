# Coding Log — harness-030-031-recovery-decision

- Date: 2026-04-20
- Scope: Implement HARNESS-030 and HARNESS-031 as one bounded recovery decision surface before queue execution.
- Status: in_progress
- Branch: `review/harness-status-20260420`
- Related planning log: `reports/planning/2026-04-20_harness-030-031-recovery-decision-plan.md`

## Task Group
- add one executable recovery decision tool
- reuse existing validation/failure evidence
- add focused validator coverage and CI wiring

## Files Investigated
- `AGENTS.md`
- `README.md`
- `logs/CURRENT.md`
- `logs/README.md`
- `pi_harness_implementation_backlog_REPO_LOCAL.md`
- `.pi/agent/docs/validation_recovery_architecture.md`
- `.pi/agent/docs/team_orchestration_architecture.md`
- `.pi/agent/docs/task_schema_semantics.md`
- `.pi/agent/extensions/till-done.ts`
- `.pi/agent/extensions/handoffs.ts`
- `.pi/agent/extensions/harness-routing.ts`
- `scripts/validate-phase-a-b.sh`
- `scripts/validate-harness-routing.sh`
- `scripts/validate-handoffs.sh`
- `scripts/check-repo-static.sh`
- `.github/workflows/ci.yml`

## Files Changed
- `.pi/agent/extensions/recovery-decision.ts`
- `scripts/validate-recovery-decision.sh`
- `scripts/check-repo-static.sh`
- `.github/workflows/ci.yml`
- `README.md`
- `.pi/agent/docs/file_map.md`
- `.pi/agent/docs/team_orchestration_architecture.md`
- `.pi/agent/docs/validation_recovery_architecture.md`
- `reports/planning/2026-04-20_harness-030-031-recovery-decision-plan.md`
- `logs/coding/2026-04-20_harness-030-031-recovery-decision.md`
- `logs/CURRENT.md`
- `reports/validation/2026-04-20_harness-030-031-recovery-decision-validation-script.md`
- `reports/validation/2026-04-20_harness-030-031-recovery-decision-validation-script.json`

## Runtime / Validation Evidence
- RED:
  - `./scripts/validate-recovery-decision.sh --report reports/validation/2026-04-20_harness-030-031-recovery-decision-validation-script.md --summary-json reports/validation/2026-04-20_harness-030-031-recovery-decision-validation-script.json`
  - key failure reason: `.pi/agent/extensions/recovery-decision.ts` did not exist yet
- GREEN:
  - `./scripts/validate-recovery-decision.sh --report reports/validation/2026-04-20_harness-030-031-recovery-decision-validation-script.md --summary-json reports/validation/2026-04-20_harness-030-031-recovery-decision-validation-script.json`
  - repeated locally for 3 consecutive passes
  - supporting gates: `./scripts/check-repo-static.sh`; `ruby -e 'require "yaml"; YAML.load_file(".github/workflows/ci.yml"); puts "yaml-ok .github/workflows/ci.yml"'`

## Key Findings
- HARNESS-030/031 intent exists in docs and backlog, but there is no executable decision surface yet.
- Existing runtime state already captures validation decision, checklist, retry count, evidence, and notes that can drive a bounded recovery decision.
- Team activation already stops normal flow for recovery, so the missing piece is the deterministic recommendation surface before queue automation.

## Decisions Made
- keep the implementation bounded to a new tool rather than expanding `till-done.ts` into a queue/recovery engine
- preserve existing action vocabulary: retry same lane, retry stronger model, switch provider, rollback, stop, escalate
- avoid destructive rollback automation; recommend rollback explicitly instead

## Known Risks
- working tree already contains unrelated modifications/deletions outside this task, so completion must stay scoped to the files touched here
- this branch is not a dedicated feature branch for HARNESS-030/031

## Current Outcome
- discovery complete
- implementation complete for the bounded recovery decision surface
- local validation green
- review completed with no product-code fixes required, but branch/worktree isolation is still needed before any merge attempt

## Next Action
- create clean PR branch from the integrated recovery policy/runtime wiring changes

## Work Summary (2026-04-20 22:07:00 +0700)

### Goal
- Reconcile the initial HARNESS-030/031 implementation attempt with the actual repo state and fix the real gap found by review.

### What changed
- Confirmed the repo already had richer recovery implementation surfaces in:
  - `.pi/agent/extensions/recovery-policy.ts`
  - `.pi/agent/extensions/recovery-runtime.ts`
  - `.pi/agent/recovery/recovery-policy.json`
  - `scripts/validate-recovery-policy.sh`
  - `scripts/validate-recovery-runtime.sh`
- Pivoted from adding a duplicate `recovery-decision` tool to wiring the existing policy/runtime surfaces into:
  - `.github/workflows/ci.yml`
  - `scripts/check-repo-static.sh`
  - `scripts/check-foundation-extension-compile.sh`
  - `README.md`
  - `.pi/agent/docs/file_map.md`
  - `.pi/agent/docs/team_orchestration_architecture.md`
  - `.pi/agent/docs/validation_recovery_architecture.md`
- Fixed the compile gate so it typechecks recovery policy/runtime files and supports `.ts` import extensions with `--allowImportingTsExtensions`.

### Tests added or changed
- no new validator script added in the final direction
- compile coverage extended to include:
  - `src/harness-routing.ts`
  - `src/recovery-policy.ts`
  - `src/recovery-runtime.ts`

### RED command and key failure reason
- `./scripts/check-foundation-extension-compile.sh`
- failed after adding recovery files to compile coverage because TypeScript rejected `.ts` import specifiers without `--allowImportingTsExtensions`.

### GREEN command
- `./scripts/check-foundation-extension-compile.sh`

### Other validation commands run
- `./scripts/validate-recovery-policy.sh`
- `./scripts/validate-recovery-runtime.sh`
- `./scripts/check-repo-static.sh`
- `ruby -e 'require "yaml"; YAML.load_file(".github/workflows/ci.yml"); puts "yaml-ok .github/workflows/ci.yml"'`

### Wiring verification evidence
- CI now runs `./scripts/validate-recovery-policy.sh` and `./scripts/validate-recovery-runtime.sh`
- static checks now require both recovery validators
- compile gate now covers `recovery-policy.ts` and `recovery-runtime.ts`
- docs now point recovery/orchestration readers at the existing policy/runtime surfaces rather than a duplicate tool

### Behavior changes and risk notes
- no new recovery semantics were invented in the final change set; the main fix is making the existing HARNESS-030/031 runtime surfaces visible, enforced, and compile-checked
- exploratory untracked files from the earlier duplicate-tool attempt must not be included in the PR

### Follow-ups or known gaps
- before PR/merge, stage only the integrated-policy/runtime wiring files and leave exploratory duplicate-tool files out of the commit

## Review (2026-04-20 22:12:00 +0700) - working-tree

### Reviewed
- Repo: `/Users/subhajlimanond/dev/ma-code`
- Branch: `feat/harness-030-031-recovery-decision`
- Scope: `working-tree`
- Commands Run: `git status --porcelain=v1`; `git diff --name-only -- .github/workflows/ci.yml .pi/agent/docs/file_map.md .pi/agent/docs/team_orchestration_architecture.md .pi/agent/docs/validation_recovery_architecture.md README.md logs/CURRENT.md reports/validation/2026-04-20_recovery-policy-validation-script.md reports/validation/2026-04-20_recovery-runtime-validation-script.md scripts/check-foundation-extension-compile.sh scripts/check-repo-static.sh`; `git diff --stat -- .github/workflows/ci.yml .pi/agent/docs/file_map.md .pi/agent/docs/team_orchestration_architecture.md .pi/agent/docs/validation_recovery_architecture.md README.md logs/CURRENT.md reports/validation/2026-04-20_recovery-policy-validation-script.md reports/validation/2026-04-20_recovery-runtime-validation-script.md scripts/check-foundation-extension-compile.sh scripts/check-repo-static.sh`; `./scripts/check-foundation-extension-compile.sh`; `./scripts/validate-recovery-policy.sh`; `./scripts/validate-recovery-runtime.sh`; `./scripts/check-repo-static.sh`

### Findings
CRITICAL
- none

HIGH
- none in the staged change set, provided exploratory untracked files (`.pi/agent/extensions/recovery-decision.ts`, `scripts/validate-recovery-decision.sh`, and their report artifacts) remain out of the commit and PR.

MEDIUM
- Validation report markdown files are generated artifacts and may change timestamps/content on reruns. That is acceptable in this repo, but reviewers should expect churn in those files.

LOW
- `logs/CURRENT.md` now points at a feature log whose content includes the exploratory duplicate-tool path and the final pivot. That keeps history visible, but readers should rely on the latest work-summary/review sections for the final intended change set.

### Open Questions / Assumptions
- Assumed the correct fix is to integrate the already-present recovery policy/runtime surfaces rather than merge a second recovery tool.
- Assumed generated validation reports are acceptable tracked evidence in this repo.

### Recommended Tests / Validation
- `./scripts/check-foundation-extension-compile.sh`
- `./scripts/validate-recovery-policy.sh`
- `./scripts/validate-recovery-runtime.sh`
- `./scripts/check-repo-static.sh`
- optional after push: rely on GitHub Actions CI plus security workflow results before merge

### Rollout Notes
- Keep the PR scoped to CI/static/doc/compile wiring for the existing recovery surfaces.
- Do not include the exploratory duplicate-tool files in the PR.
- Merge only after CI/security gates pass.

## Work Summary (2026-04-20 21:39:00 +0700)

### Goal
- Create a RED signal for the bounded HARNESS-030/031 recovery decision surface before implementing runtime logic.

### What changed
- Added `scripts/validate-recovery-decision.sh` as a focused validator scaffold for the new recovery tool.
- Added paired planning/coding logs and switched `logs/CURRENT.md` to the new feature group.

### Tests added or changed
- Added validator coverage for:
  - same-lane retry recommendation on first validation failure
  - stronger-model retry after repeated reasoning failure
  - rollback recommendation for unsafe repo state

### RED command and key failure reason
- `./scripts/validate-recovery-decision.sh --report reports/validation/2026-04-20_harness-030-031-recovery-decision-validation-script.md --summary-json reports/validation/2026-04-20_harness-030-031-recovery-decision-validation-script.json`
- failed because `.pi/agent/extensions/recovery-decision.ts` did not exist yet, proving the new executable decision surface was still missing.

### GREEN command
- none yet

### Other validation commands run
- none

### Wiring verification evidence
- none yet

### Behavior changes and risk notes
- no runtime behavior change yet; this was validator-first scaffolding only
- the initial validator script needed a small follow-up so custom relative report paths resolve under the repo root reliably

### Follow-ups or known gaps
- implement the new recovery-decision extension
- wire the validator into repo static checks and CI

## Work Summary (2026-04-20 21:45:00 +0700)

### Goal
- Implement one executable recovery decision surface that reuses existing validation/failure evidence and prevents blind retry loops before HARNESS-032.

### What changed
- Added `.pi/agent/extensions/recovery-decision.ts` with exported helper logic and the `resolve_recovery_decision` tool.
- Updated `scripts/validate-recovery-decision.sh` to resolve custom report paths against the repo root.
- Wired the new validator into `scripts/check-repo-static.sh` and `.github/workflows/ci.yml`.
- Updated `README.md`, `.pi/agent/docs/validation_recovery_architecture.md`, `.pi/agent/docs/team_orchestration_architecture.md`, and `.pi/agent/docs/file_map.md` so the new surface is discoverable.

### Tests added or changed
- `scripts/validate-recovery-decision.sh`
  - helper check 1: first failed validation => `retry_same_lane`
  - helper check 2: repeated reasoning failure => `retry_stronger_model`
  - helper check 3: unsafe repo state => `rollback`
  - optional live probe: tool invocation for `resolve_recovery_decision`

### RED command and key failure reason
- `./scripts/validate-recovery-decision.sh --report reports/validation/2026-04-20_harness-030-031-recovery-decision-validation-script.md --summary-json reports/validation/2026-04-20_harness-030-031-recovery-decision-validation-script.json`
- failed because `.pi/agent/extensions/recovery-decision.ts` was missing.

### GREEN command
- `./scripts/validate-recovery-decision.sh --report reports/validation/2026-04-20_harness-030-031-recovery-decision-validation-script.md --summary-json reports/validation/2026-04-20_harness-030-031-recovery-decision-validation-script.json`

### Other validation commands run
- `./scripts/validate-recovery-decision.sh --report reports/validation/2026-04-20_harness-030-031-recovery-decision-validation-script.md --summary-json reports/validation/2026-04-20_harness-030-031-recovery-decision-validation-script.json` (run 3 consecutive passing times for flake resistance)
- `./scripts/check-repo-static.sh`
- `ruby -e 'require "yaml"; YAML.load_file(".github/workflows/ci.yml"); puts "yaml-ok .github/workflows/ci.yml"'`

### Wiring verification evidence
- tool registration verified in `.pi/agent/extensions/recovery-decision.ts` via `pi.registerTool({ name: "resolve_recovery_decision", ... })`
- repo static checks now require `scripts/validate-recovery-decision.sh`
- CI now runs `./scripts/validate-recovery-decision.sh` in `.github/workflows/ci.yml`
- docs now point recovery/orchestration readers at `.pi/agent/extensions/recovery-decision.ts` and its validator

### Behavior changes and risk notes
- recovery/orchestration layers now have one bounded decision surface that classifies failure evidence and emits explicit retry/rollback/stop/escalation recommendations
- the tool reuses existing evidence arrays, notes, retry count, validation decision/checklist, provider reliability, repo-state flags, and failed-model history instead of inventing a separate retry memory path
- rollback remains recommendation-only; the tool does not bypass human approval or perform destructive git actions

### Follow-ups or known gaps
- no live provider-backed probe was used because local helper-level evidence was sufficient for this bounded deterministic surface
- future queue execution work may want the queue runner to call this tool automatically using task-state payloads rather than manual input mapping

## Review (2026-04-20 21:49:00 +0700) - working-tree

### Reviewed
- Repo: `/Users/subhajlimanond/dev/ma-code`
- Branch: `review/harness-status-20260420`
- Scope: `working-tree` for intended HARNESS-030/031 files
- Commands Run: `git status --porcelain=v1`; `git diff --name-only -- . ':(exclude)logs/harness-actions.jsonl'`; `git diff --stat -- . ':(exclude)logs/harness-actions.jsonl'`; `git diff -- .github/workflows/ci.yml README.md .pi/agent/docs/file_map.md .pi/agent/docs/team_orchestration_architecture.md .pi/agent/docs/validation_recovery_architecture.md scripts/check-repo-static.sh logs/CURRENT.md`; targeted readback of `.pi/agent/extensions/recovery-decision.ts`; targeted readback of `scripts/validate-recovery-decision.sh`; targeted readback of the generated validation report

### Findings
CRITICAL
- none

HIGH
- The working tree includes unrelated tracked changes and deletions outside this task (`packages/pi-g-skills/extensions/auggie-discovery.ts`, `packages/pi-g-skills/extensions/second-model-opus.ts`, runtime task state/log files, and prior-log edits). This means the branch is not safe to merge as-is; isolate or discard unrelated changes before any PR/merge attempt.

MEDIUM
- `resolve_recovery_decision` currently relies on callers to supply bounded evidence fields rather than directly reading task state. That is acceptable for this bounded slice, but queue/orchestration follow-up work should standardize the payload mapping to avoid inconsistent callers.

LOW
- The validator's live probe is optional and skipped by default. That keeps cost low, but if future regressions involve tool registration rather than helper logic, a single bounded live probe may become worthwhile.

### Open Questions / Assumptions
- Assumed this task should stay bounded to recommendation logic and not add rollback execution.
- Assumed local helper-level validation is sufficient proof for this deterministic surface.

### Recommended Tests / Validation
- Keep `./scripts/validate-recovery-decision.sh` in CI.
- When queue execution lands, add one integration validator that feeds actual task-state payloads into `resolve_recovery_decision`.

### Rollout Notes
- Do not merge or present as merge-ready until unrelated working-tree changes are isolated.
- Recovery tool output is recommendation-only and should remain subject to existing approval/runtime safety controls.
