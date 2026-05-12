# Issue Materialization Backlog — mixed-domain-harness-optimization

## Source
- kind: g-issues
- capturedAt: 2026-05-12T04:02:34.000Z
- approvedBy: human:subhajlimanond
- approvalRef: user-prompt-2026-05-12-mixed-domain-harness-optimization-materialization
- sourceHash: 03a17ab7897f0d3aa6941ba6e728608658191c2641e47274d272f13dff5de608

## Phase A Boundary
- Queue readiness remains `not_ready` for every issue.
- Queue-ready conversion belongs to Phase B.
- No queue jobs, task packets, worker sessions, or runtime state are materialized by this helper.

## Issue List

### issue-001: Approve mixed-domain harness operating contract
- type: AFK
- status: done
- queueReadiness: not_ready
- dependencies: none
- userStoriesCovered:
  - mixed-domain-harness-optimization-story-001
- whatToBuild:
  - Record the already-approved mixed-domain harness operating contract as a resolved prerequisite so downstream AFK implementation slices can start.
- acceptanceCriteria:
  - The mixed-domain operating contract is captured as an already-resolved prerequisite for the initiative.
  - Downstream AFK slices can start without a remaining issue-materialization HITL gate.
  - The durable source metadata still records the human approval reference that resolved this prerequisite.
- validationProof:
  - Source metadata retains the human approval reference and downstream pipeline slices are no longer blocked on issue-001 review.
- filesToModify:
  - docs/initiatives/mixed-domain-harness-optimization/contract.md
  - .pi/agent/docs/team_orchestration_architecture.md
- allowedPaths:
  - docs/initiatives/mixed-domain-harness-optimization
  - .pi/agent/docs
- hitlGates:
  - none

### issue-002: Preflight mixed-domain validation contracts before worker execution
- type: AFK
- status: planned
- queueReadiness: not_ready
- dependencies: issue-001
- userStoriesCovered:
  - mixed-domain-harness-optimization-story-002
- whatToBuild:
  - Add a preflight that verifies declared validation/proof commands exist before mixed-domain worker execution starts.
- acceptanceCriteria:
  - Missing validation scripts or commands are detected before runtime worker execution begins.
  - The job is marked blocked with an explicit validation-contract reason when proof commands are missing.
  - Regression coverage exists for the missing `npm run test:integration -- health-handshake` wrapper case.
- validationProof:
  - node --import tsx --test tests/extension-units/afk-orchestration.test.ts tests/extension-units/worker-execution.test.ts
  - git diff --check
- filesToModify:
  - .pi/agent/extensions/afk-orchestration.ts
  - .pi/agent/extensions/worker-execution.ts
  - tests/extension-units/afk-orchestration.test.ts
  - tests/extension-units/worker-execution.test.ts
- allowedPaths:
  - .pi/agent/extensions
  - tests/extension-units
- hitlGates:
  - none

### issue-003: Add first-class composite mixed-domain worker packet and role semantics
- type: AFK
- status: planned
- queueReadiness: not_ready
- dependencies: issue-002
- userStoriesCovered:
  - mixed-domain-harness-optimization-story-003
- whatToBuild:
  - Replace first-domain-wins routing with explicit composite mixed-domain packet and worker-role semantics.
- acceptanceCriteria:
  - A FE+BE slice no longer silently collapses into a plain `frontend_worker` job.
  - Queue jobs and task packets preserve mixed-domain ownership metadata end-to-end.
  - Routing tests prove composite mixed-domain role handling for representative FE/BE combinations.
- validationProof:
  - node --import tsx --test tests/extension-units/afk-orchestration.test.ts tests/extension-units/queue-runner.test.ts tests/extension-units/harness-routing.test.ts
  - git diff --check
- filesToModify:
  - .pi/agent/extensions/afk-orchestration.ts
  - .pi/agent/extensions/task-packets.ts
  - .pi/agent/extensions/queue-runner.ts
  - tests/extension-units/afk-orchestration.test.ts
  - tests/extension-units/queue-runner.test.ts
  - tests/extension-units/harness-routing.test.ts
- allowedPaths:
  - .pi/agent/extensions
  - tests/extension-units
- hitlGates:
  - none

### issue-004: Add salvage-aware recovery for interrupted mixed-domain worker runs
- type: AFK
- status: planned
- queueReadiness: not_ready
- dependencies: issue-003
- userStoriesCovered:
  - mixed-domain-harness-optimization-story-004
- whatToBuild:
  - Detect salvageable preserved mixed-domain diffs plus local passing proof and convert failed runtime lanes into resumable or reviewable states.
- acceptanceCriteria:
  - Interrupted or provider-failed mixed-domain runs with a valid preserved diff can be resumed or promoted for review.
  - Queue and task state no longer remain misleadingly failed when salvage evidence exists.
  - Recovery artifacts explain the salvage path and retained proof.
- validationProof:
  - node --import tsx --test tests/extension-units/queue-runner.test.ts tests/extension-units/worker-execution.test.ts
  - git diff --check
- filesToModify:
  - .pi/agent/extensions/queue-runner.ts
  - .pi/agent/extensions/worker-execution.ts
  - tests/extension-units/queue-runner.test.ts
  - tests/extension-units/worker-execution.test.ts
- allowedPaths:
  - .pi/agent/extensions
  - tests/extension-units
- hitlGates:
  - none

### issue-005: Improve mixed-domain parallelism beyond shared-path-root serialization
- type: AFK
- status: planned
- queueReadiness: not_ready
- dependencies: issue-004
- userStoriesCovered:
  - mixed-domain-harness-optimization-story-005
- whatToBuild:
  - Replace simple shared-path-root serialization with smarter mixed-domain parallel-safety analysis that still blocks true conflicts.
- acceptanceCriteria:
  - Safe non-overlapping mixed-domain slices can be marked parallel candidates.
  - Unsafe overlapping mixed-domain slices remain forced sequential.
  - Parallel decision output explains exactly why slices are parallel-safe or blocked.
- validationProof:
  - node --import tsx --test tests/extension-units/afk-orchestration.test.ts tests/extension-units/parallel-worker-lanes.test.ts
  - git diff --check
- filesToModify:
  - .pi/agent/extensions/afk-orchestration.ts
  - tests/extension-units/afk-orchestration.test.ts
  - tests/extension-units/parallel-worker-lanes.test.ts
- allowedPaths:
  - .pi/agent/extensions
  - tests/extension-units
- hitlGates:
  - none

### issue-006: Add coordinated sub-lane execution under one mixed-domain parent slice
- type: AFK
- status: planned
- queueReadiness: not_ready
- dependencies: issue-005
- userStoriesCovered:
  - mixed-domain-harness-optimization-story-006
- whatToBuild:
  - Add a first-class coordinator that can spawn bounded FE/BE/BFF-style sub-lanes under one mixed-domain parent slice and reunify evidence automatically.
- acceptanceCriteria:
  - A parent mixed-domain slice can orchestrate child implementation lanes without losing vertical-slice identity.
  - Parent completion requires child evidence and conflict checks to pass.
  - Pipeline and queue artifacts capture the parent/child relationship clearly.
- validationProof:
  - node --import tsx --test tests/extension-units/queue-runner.test.ts tests/extension-units/product-pipeline.test.ts tests/extension-units/parallel-worker-lanes.test.ts
  - git diff --check
- filesToModify:
  - .pi/agent/extensions/queue-runner.ts
  - .pi/agent/extensions/task-packets.ts
  - .pi/agent/extensions/product-pipeline.ts
  - scripts/harness-parallel-worker-lanes.ts
  - tests/extension-units/queue-runner.test.ts
  - tests/extension-units/product-pipeline.test.ts
  - tests/extension-units/parallel-worker-lanes.test.ts
- allowedPaths:
  - .pi/agent/extensions
  - scripts
  - tests/extension-units
- hitlGates:
  - none

## Dependencies

- issue-001: none
- issue-002: issue-001
- issue-003: issue-002
- issue-004: issue-003
- issue-005: issue-004
- issue-006: issue-005
