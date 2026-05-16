# Greenfield Phase C Worker Execution Proof Plan

- Date: 2026-05-16
- Task: `task-1778908809726`
- Coding log: `logs/coding/2026-05-16_greenfield-phase-c-worker-execution-proof.md`
- Intake: direct implementation request after Phase B completion analysis.

## Refactor target
- Target module/subsystem: worker execution boundary for Greenfield Phase C proof.
- Primary interface: `scripts/harness-worker-execute.ts` / `runWorkerExecution`.
- Supporting seam: Greenfield Phase C proof artifact and validator.

## Current friction
- Worker execution gate was red because the CLI fixture expected `review_ready` for a queue job with no `implementationCommand` or `workerExecutionPlan`.
- Phase B correctly remains candidate-only, so Phase C needs separate proof metadata rather than mutating historical queue-readiness artifacts.

## Deep-module analysis
- Module: worker execution runner.
- Interface: bounded CLI commands (`dry-run`, `run`, `status`, `explain-run`) plus queue job metadata.
- Seam: proof job artifact supplies the execution command and validation contract; runner keeps safety enforcement behind its interface.
- Adapter: `scripts/validate-greenfield-phase-c.mjs` adapts Greenfield Phase B candidate artifacts into a deterministic Phase C proof contract.
- Depth/leverage/locality: keep safety complexity inside worker execution and validators; callers provide metadata only.
- Deletion test: removing the Phase C proof artifact would push provenance, allowed-path, PR-boundary, and validation decisions into ad hoc caller logic.

## Dependency classification
- In-process: worker execution extension, queue job type/schema, validator scripts.
- Local-substitutable: test fixture repo and local node implementation command.
- Remote but owned: GitHub PR/checks for final landing.
- True external: GitHub account/Actions availability and branch protection.

## First TDD slice
- Add failing integration coverage for `scripts/validate-greenfield-phase-c.mjs` before the script/artifact exists.
- Implement the smallest proof artifact and validator to pass.
- Correctly rebaseline worker-execution CLI fixture so review-ready requires an implementation command supplied by the proof job/queue job metadata.

## Acceptance criteria
- `npm run validate:greenfield-phase-c` passes and reports exactly one proof job.
- `npm run validate:worker-execution` passes.
- `npm run validate:greenfield-phase-b` still passes and continues to preserve Phase B boundaries.
- `npm run validate:greenfield-docs` and `npm run validate:greenfield-scaffold` pass.
- `git diff --check` passes.
- PR is created; normal merge/local-main sync is attempted only if checks allow it without bypassing protections.
