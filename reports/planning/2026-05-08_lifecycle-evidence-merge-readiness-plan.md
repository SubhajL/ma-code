# Lifecycle Evidence Merge Readiness Plan

## Goal
- Let `harness:merge` consume deterministic lifecycle evidence from worktree-safe files so valid PRs can reach `merge_ready` without reading protected runtime JSON from the worktree.

## Acceptance Criteria
- `assessSliceLifecycle` can consume a lifecycle evidence bundle.
- Valid evidence can satisfy planning/task/RED/GREEN/review/create/submit/PR-gate stages through `merge_ready`.
- Missing or invalid evidence still blocks.
- `harness:merge` can pass a lifecycle evidence file into lifecycle assessment.
- Existing log/runtime-state behavior remains supported.

## TDD Slice
- First tracer behavior: `assessSliceLifecycle({ evidenceFile, targetStage: "merge_ready" })` returns ready for a valid worktree lifecycle bundle with no runtime task JSON.
- Public interface: `harness:slice-lifecycle check --stage merge_ready --evidence-file <path>` and `harness:merge check --pr <n> --lifecycle-evidence <path>`.
- Boundary dependencies: filesystem evidence bundle, git status, fake GitHub runner in merge helper tests.
- Out of scope: automatic PR merge bypasses, protected runtime JSON mutation, broad lifecycle redesign.

## Direct Implementation Exemption
- User requested immediate implementation from prior plan; this bounded change uses explicit acceptance criteria and TDD evidence rather than a new intake artifact.
