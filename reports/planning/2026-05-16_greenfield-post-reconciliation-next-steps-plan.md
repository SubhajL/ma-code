# Greenfield Post-Reconciliation Next Steps Plan

- Date: 2026-05-16
- Task: `task-1778890881535`
- Coding log: `logs/coding/2026-05-13_initiative-completion-and-workerjob-bridge.md`
- Intake: direct planning request; no implementation in this task.

## Goal
- Explain what remains after Greenfield queue/task reconciliation.
- Plan bounded next actions for globally blocked historical tasks, local cleanup, and queueReadiness semantics.

## Current facts
- Greenfield queue jobs `afk-greenfield-scaffold-issue-002` and `afk-greenfield-scaffold-issue-003` are `done`.
- `task-1778403385498` was reconciled to `done/overridden`.
- Runtime queue has no blocked jobs.
- Ten historical tasks remain globally blocked.
- `docs/initiatives/greenfield-scaffold/readiness-checklist.md` documents final meaning as Phase A/B scaffold complete with guarded historical artifacts.
- `queueReadiness: not_ready` remains intentional Phase A guardrail metadata.

## Recommended next tracks

### Track 1: Stop Greenfield product work under current scope
- Treat Greenfield as complete under the documented Phase A/B scaffold contract.
- Do not run further product implementation unless a new explicit queue-ready/autonomous contract is approved.

### Track 2: Historical blocked-task housekeeping
- Review the ten globally blocked tasks one by one.
- Do not bulk-close them.
- Use classifications from `docs/initiatives/greenfield-scaffold/blocked-task-classification.md` as the starting point.
- For each task choose one disposition:
  - `superseded_by_later_evidence`
  - `unrelated_stale`
  - `still_active_needs_owner`
  - `requires_human_decision`

### Track 3: Local untracked cleanup
- The Greenfield-adjacent unresolved item is local cleanup, not tracked product completion.
- Before deleting anything, run a dry-run/inspection path and ask for human confirmation if any file is not obviously disposable.
- Do not remove `.codex/`, `coding-logs/`, or validation reports unless the human explicitly confirms those exact paths.

### Track 4: Queue-readiness future design
- Keep `queueReadiness: not_ready` unchanged.
- If the desired future is fully autonomous queue-ready Greenfield execution, create a new PRD/design that defines:
  - what `ready` means
  - who may dispatch jobs
  - evidence and approval requirements
  - how old Phase A artifacts migrate
  - worker-execution validation gates

## First TDD slice for any follow-up implementation
- Public interface: a task-disposition/report command or doc validator, depending on chosen track.
- First behavior: given blocked tasks and disposition metadata, the command/report shows no Greenfield product blockers remain while preserving unrelated blockers.
- Boundary dependencies: runtime task state read-only fixture; no live provider calls.
- Out of scope: destructive cleanup, queueReadiness migration, autonomous worker dispatch.

## Acceptance checks
- `inspect_queue_state recentLimit=5 includeHistory=false`
- `npm run validate:greenfield-docs`
- `npm run validate:greenfield-scaffold`
- Optional if new code is added: targeted integration test for the new command/report.

## Risks
- Over-cleaning historical blocked tasks may hide real work.
- Deleting untracked files may remove human-local evidence.
- Flipping `queueReadiness` would contradict current validators and artifact semantics.

## Clarification checkpoint (2026-05-16 09:46:25 +07) - Phase B/C scope split

### Discovery
- Read `logs/CURRENT.md` and active Greenfield planning log pointer.
- Read g-grill skill and Pi log convention.
- Auggie discovery timed out; used local fallback with `find`, `rg`, and targeted reads.
- Inspected `docs/initiatives/greenfield-scaffold/README.md`, `validation.md`, `readiness-checklist.md`, `foundation-contract.md`, `backout.md`, and `slice-plan.json` policy.
- Current policy evidence: `slice-plan.json` says `phase: A_issue_materialization_only`, `queueReadyConversion: deferred_to_phase_b`, `queueReadiness: not_ready`, `noWorkerExecution: true`, and `noRuntimeStateMutation: true`.

### Clarified recommendation
- Do not make Phase B encompass queue-readiness conversion, autonomous worker execution, and product scaffold expansion all at once.
- Recommended split:
  - Phase B: queue-readiness semantics and safe conversion design/proof.
  - Phase C: autonomous worker execution using the Phase B contract.
  - Product scaffold expansion: separate product track or later phase, after runtime readiness is safe, unless a tiny fixture is needed for testing.

### Meaning of product scaffold expansion
- Product scaffold expansion means adding real product-facing surface beyond the approved placeholder scaffold: UI routes/components, API resources, persistence/auth boundaries, domain workflows, integration behavior, observability, and deployment/backout posture.
- Existing docs only approve the baseline shell: `apps/web`, `services/api`, validation wiring, placeholder navigation/contracts, and readiness documentation.

### Decision needed
- Preferred default unless overridden: make Phase B runtime-safety only, with explicit non-goal of autonomous execution and product feature expansion.
