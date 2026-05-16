# Greenfield Phase B Queue-Readiness Contract

## Purpose
- Define the Phase B queue-readiness proof for the Greenfield scaffold without enabling autonomous worker execution.
- Convert Phase A `queueReadiness: not_ready` artifacts into read-only queue-ready candidate evidence.
- Preserve Phase A guardrails until a later Phase C worker-execution proof is explicitly approved.

## Phase B status model
- `queue_ready_candidate`: a scaffold slice has enough bounded metadata to be considered for future queue materialization.
- `not_ready_missing_metadata`: a scaffold slice is still missing required candidate metadata.
- `candidate_only`: Phase B emits derived evidence only; it does not flip source artifacts to executable queue jobs.

## Candidate requirements
- Source slice remains `queueReadiness: not_ready` in Phase A artifacts.
- Source policy keeps `queueReadyConversion: deferred_to_phase_b`.
- Source policy keeps `noWorkerExecution: true`.
- Source policy keeps `noRuntimeStateMutation: true`.
- Candidate has an issue id, title, allowed paths, and HITL gate metadata.

## Explicit non-goals
- Do not run autonomous workers in Phase B.
- Do not mutate `.pi/agent/state/runtime/*.json`.
- Do not convert candidates into live queue jobs.
- Do not expand product scaffold behavior beyond validation fixtures.

## Validation
- Run `npm run validate:greenfield-phase-b` for human-readable output.
- Run `node scripts/validate-greenfield-phase-b.mjs --json` for deterministic machine-readable evidence.
- The validator must report `workerExecution: disabled` and `runtimeMutation: disabled`.
