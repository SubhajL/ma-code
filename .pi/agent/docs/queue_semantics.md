# Queue Semantics

This document defines the intended semantics of the queue state model under:
- `.pi/agent/state/schemas/queue.schema.json`
- `.pi/agent/state/runtime/queue.json`

It specifies what a queue job means, how jobs move through the lifecycle, and how queue behavior should remain deterministic.

## Purpose
The queue exists to support bounded autonomy without chaos.
Its job is to represent:
- what work is waiting
- what work is running
- what work is blocked or failed
- what work is complete
- what should run next
- whether queue pickup is currently paused

The queue is not the same thing as the task state.
A queue job is a higher-level unit of work that may create or drive one or more tasks.

## Scope
This document defines:
- queue-level fields and meanings
- queue job fields and meanings
- queue lifecycle states
- scheduling and ordering rules
- dependency semantics
- priority semantics
- blocked vs failed behavior
- budget and stop-condition intent
- who may create jobs

It does not define:
- the full live queue runner implementation
- scheduler daemon behavior
- UI rendering
- multi-machine dispatch

## Current queue shape
Current queue shape is a versioned top-level object:

```json
{
  "version": 1,
  "paused": false,
  "activeJobId": null,
  "jobs": [
    {
      "id": "harness-009-queue-semantics",
      "goal": "Finalize queue semantics",
      "priority": "high",
      "status": "queued"
    }
  ]
}
```

## Queue-level fields

### `version`
- schema/state version for the queue contract
- current value is `1`
- future structural changes should increment this intentionally

### `paused`
- whether new queue pickup is currently paused
- `true` means no new job should move from `queued` to `running`
- `false` means normal eligibility rules decide pickup

### `activeJobId`
- queue-level pointer to the currently active job
- should be `null` when no job is running
- if non-null, it should refer to one job in `jobs` whose `status` is `running`

### `jobs`
- ordered list of queue jobs
- order is part of deterministic selection when priority and eligibility tie

## Queue model

### Queue job
A queue job is a bounded assignment for the orchestrator.
It should be small enough to:
- route clearly
- validate clearly
- stop safely
- report clearly

A good queue job is not an entire roadmap phase.
It is a tractable assignment.

Good jobs:
- `Document task schema semantics`
- `Review safe-bash block reasons`
- `Add validator report naming check`

Bad jobs:
- `Finish the whole harness`
- `Autonomously improve the repo forever`

### Relationship between jobs and tasks
Recommended distinction:
- **queue job** = orchestration-level unit of work
- **task** = execution-level tracked unit tied to mutation/evidence discipline

One job may:
- create one task, or
- create several bounded tasks, or
- route through planning first and then create downstream tasks

But the queue should remain the top-level assignment list.

## Who may create jobs
For the current bounded harness slice, queue-job creation should be limited to:
- human/operator input
- orchestrator-generated follow-up work that stays within approved scope
- future queue-runner maintenance or migration tools explicitly designed for queue state

Normal worker lanes should not silently create arbitrary new top-level jobs.
If a worker discovers out-of-scope work, it should surface:
- a note
- a blocker
- a handoff or escalation recommendation

This keeps top-level queue growth reviewable instead of improvised.

## Per-job fields

### `id`
- unique stable job identifier
- should be machine-safe and human-referenceable
- should not be reused

Recommended style:
- `job-001`
- `queue-20260418-docs-01`
- `harness-009-queue-semantics`

### `goal`
- one-line description of the intended outcome
- should be actionable and bounded
- should be specific enough for routing

### `priority`
Allowed values:
- `low`
- `medium`
- `high`

Priority meaning:
- `high`: important and should be selected before medium/low peers unless blocked by dependencies
- `medium`: default work
- `low`: useful but deferrable

Priority does not override safety, dependencies, or stop conditions.

### `status`
Allowed values:
- `queued`
- `running`
- `blocked`
- `done`
- `failed`

Status meaning:
- `queued`: eligible to run once selected and dependencies permit
- `running`: currently assigned to the orchestrator execution path
- `blocked`: cannot proceed because an external blocker or prerequisite is unresolved
- `done`: completed with acceptable evidence
- `failed`: ended unsuccessfully and requires retry/replacement/review before further action

### `scope`
- optional bounded scope statement
- should describe file/domain boundaries or outcome boundaries
- especially useful when the goal alone is too short to constrain execution

Example:
- `docs only under .pi/agent/docs`
- `backend changes limited to api/auth modules`

### `team`
- optional preferred starting team
- one of:
  - `planning`
  - `build`
  - `quality`
  - `recovery`
- may be omitted when the orchestrator should choose based on the job description

### `budget`
- optional bounded budget object
- intended keys in version 1:
  - `maxRetries`
  - `maxRuntimeMinutes`
  - `maxFailedValidations`
  - `maxCostUsd`
  - `maxFilesChanged`
- values should be conservative and reviewable
- current executable behavior in HARNESS-034:
  - `budget.maxRetries` is enforced conservatively before restarting a queued job with an existing linked failed task
  - `budget.maxRuntimeMinutes` is enforced on an active running job using the queue job `startedAt` timestamp
  - `budget.maxFailedValidations` is enforced conservatively from the current linked task validation outcome because there is not yet a dedicated failed-validation counter in runtime state
  - unsupported `budget.maxCostUsd` and `budget.maxFilesChanged` still block the job clearly instead of being silently ignored

### `stop_conditions`
- optional list of conditions that should force stop, pause, or escalation
- should be explicit and reviewable
- current executable behavior in HARNESS-034:
  - `approval_boundary_hit` is the only supported `stop_conditions` token in the bounded queue runner
  - the actual approval-boundary signal comes from queue-job `approvalRequired: true`
  - other free-form `stop_conditions` values still block the job clearly as unsupported controls

Examples:
- `approval_boundary_hit`
- `stop if protected path access is required`
- `stop if scope expands beyond docs`

### `dependencies`
- list of job IDs that must resolve before this job should run normally
- dependency IDs should refer to other queue jobs, not free-form prose
- unresolved dependencies should keep the job from moving into `running`

### Executable queue-runner fields
For the HARNESS-032 bounded single-runner path, jobs may also include executable metadata used to create a linked task and packet safely.

Important executable fields:
- `acceptanceCriteria`
  - explicit acceptance criteria for the linked task
  - the queue runner blocks queued jobs that omit this field or leave it empty
- `approvalRequired`
  - explicit approval-boundary signal for bounded autonomy
  - queued jobs with `approvalRequired: true` are blocked before start
  - active running jobs with `approvalRequired: true` are stopped together with the linked task in one coordinated mutation
- `taskClass`
  - optional task class for the linked `till-done` task
  - defaults to `implementation`
- `workType`
  - optional work type used by team activation and packet generation
- `scheduledWorkflowId`
  - optional provenance tag for queue jobs materialized from `.pi/agent/schedules/scheduled-workflows.json`
  - helps operators distinguish recurring scheduled jobs from ad hoc queue entries
- `scheduledRunKey`
  - optional per-run uniqueness key such as a UTC date stamp
  - used by the scheduled-workflow helper to avoid silently creating duplicate queue jobs for the same recurring run window
- `domains` or `allowedPaths`
  - at least one of these should be present for executable packet generation
  - if both are missing, the runner cannot generate a bounded packet and should block the job
- `assignedRole`
  - optional explicit starting role
  - if omitted, the queue runner uses the selected team's lead role
- `qualityInput`
  - optional structured runtime input for the bounded queue→quality path
  - current HARNESS-048 slice uses it for queued `quality_lead` jobs only
  - required fields:
    - `sourcePacketId`
    - `sourceHandoff` (structured `worker_to_quality` handoff object)
  - the queue runner consumes this structured object directly to derive the quality packet scope, inspect paths, and parent packet linkage
  - missing or malformed `qualityInput` blocks the targeted quality transition instead of falling back to ad hoc prose fields
- `routeReason`, `budgetMode`, `modelOverride`
  - optional routing controls passed through to task-packet generation
- queue jobs do **not** carry packet-override lists for `disallowedPaths`, `discoverySummary`, `crossModelPlanningNote`, `evidenceExpectations`, `validationExpectations`, `wiringChecks`, or `escalationInstructions`
  - HARNESS-032 uses the task-packet policy defaults for those bounded fields instead of duplicating them in queue state
  - HARNESS-048 adds one narrow exception for quality-lane pickup: queued `quality_lead` jobs may carry `qualityInput.sourceHandoff`, and the runner derives those bounded packet fields from the structured handoff instead of ad hoc queue-job prose
- `budget`, `stop_conditions`
  - these remain part of the queue contract
  - HARNESS-034 enforces `maxRetries`, `maxRuntimeMinutes`, `maxFailedValidations`, and the `approval_boundary_hit`/`approvalRequired` stop boundary
  - unsupported free-form `stop_conditions` plus unsupported `maxCostUsd` and `maxFilesChanged` still block clearly

Runtime-populated linkage and observability fields:
- `linkedTaskId`
- `packetId`
- `selectedModelId`
- `initialHandoffId`
- `startedAt`
- `finishedAt`
- `updatedAt`
- `notes`
- `lastRecoveryAction`
- `lastRecoveryReason`

These runtime fields let the queue stay visibly connected to downstream task, packet, handoff, and recovery state without implying a free-running daemon.

## Lifecycle semantics

### `queued`
A job in `queued` is waiting for selection.
It may still be ineligible to run if:
- dependencies are unresolved
- required approval is missing
- the queue is paused
- explicit acceptance criteria are missing
- bounded packet inputs such as `domains` or `allowedPaths` are missing
- the job hits an approval boundary before start
- the job specifies unsupported free-form `stop_conditions` or unsupported budget fields such as `maxCostUsd`/`maxFilesChanged`

### `running`
A job in `running` is the current active queue job.
For version 1 bounded autonomy, the recommended default is:
- one running job at a time per queue executor

This keeps execution and recovery reviewable.

### `blocked`
Use `blocked` when the job cannot continue because of:
- unresolved dependency
- unclear requirements
- required human approval
- repo-state conflict
- provider/tool instability
- failed prerequisite validation

Blocked jobs should remain visible and retain their context.
They should not be silently downgraded back to `queued` without noting why.

### `done`
A job may enter `done` only when:
- its bounded goal has been met
- required downstream task evidence exists
- required validation/review path has completed for the job class

### `failed`
Use `failed` when:
- the job attempt ended unsuccessfully
- retry was not immediately approved
- validation definitively rejected the outcome
- the job cannot proceed within budget or stop conditions

Blocked is not the same as failed.
Blocked means waiting.
Failed means the attempt ended badly.

## Legal status transitions
| From | To | Allowed | Notes |
|---|---|---:|---|
| `queued` | `running` | yes | when selected and dependencies permit |
| `queued` | `blocked` | yes | if prerequisites or approvals are missing |
| `queued` | `failed` | yes | rare; use for invalid job definition or explicit rejection |
| `queued` | `done` | no | cannot complete without execution |
| `running` | `done` | yes | after acceptable completion evidence |
| `running` | `blocked` | yes | if execution hits external blocker |
| `running` | `failed` | yes | if attempt ends unsuccessfully |
| `running` | `queued` | yes | only for explicit requeue/reset decision |
| `blocked` | `queued` | yes | when blocker clears but execution has not resumed |
| `blocked` | `running` | yes | when blocker clears and execution resumes directly |
| `blocked` | `failed` | yes | if blocker becomes terminal |
| `done` | any other state | no by default | prefer new job or explicit future reopen policy |
| `failed` | `queued` | yes | explicit retry/requeue decision |
| `failed` | `running` | yes | explicit retry start |
| `failed` | `done` | no | requires retry/revalidation first |

## Queue-level invariants
The queue should remain structurally coherent.
Recommended invariants for version 1:
- `activeJobId` is `null` or names one job in `jobs`
- if `activeJobId` is non-null, exactly one job should be `running`
- if the queue is `paused`, no new pickup should occur until unpaused
- completed jobs stay visible until intentionally pruned by a future maintenance policy

## Scheduling and ordering rules

### Deterministic selection rule
When multiple jobs are eligible, the queue should select jobs by:
1. highest priority first
2. oldest eligible job first within the same priority when timestamps exist
3. existing queue order as the tie-breaker when timestamps do not exist yet

This avoids ad hoc job selection.

### Eligibility rule
A job is eligible to run only when:
- queue `paused` is `false`
- `status` is `queued`
- dependencies are satisfied or explicitly waived
- explicit `acceptanceCriteria` exist
- bounded packet inputs exist so the runner can generate a task packet
- no unsupported budget/stop-condition control is present on the queued job
- `approvalRequired` is not already signaling an approval boundary before start
- required human approval has been granted when needed

### Single-runner recommendation
For the first bounded autonomy version, prefer:
- one queue runner
- one active `running` job at a time

Parallel queue execution should come later with explicit worktree isolation and collision rules.

## Priority semantics
Priority should guide selection, not excuse bad scope.
A high-priority job that is vague, risky, or approval-blocked should still stop or block.

Recommended interpretation:
- `high`: should preempt lower-priority ready work
- `medium`: normal work queue
- `low`: defer when higher-value work exists

Avoid too many `high` jobs.
If everything is high, nothing is prioritized.

## Dependency semantics
A dependency means:
- the dependent job should not start normally until the dependency is `done`, or
- a human/operator explicitly waives the dependency

Dependencies should be used for real execution order, not as a general note field.

Good dependency:
- `job-queue-schema` depends on `job-task-schema`

Bad dependency usage:
- `dependencies: ["might need docs later"]`

## Blocked vs failed
This distinction must stay sharp.

### Use `blocked` when:
- work cannot continue yet
- resolution may come from outside the current execution lane
- the job might continue unchanged after the blocker clears

Examples:
- waiting for approval
- missing repo access
- upstream dependency not done
- ambiguous requirement needs clarification

### Use `failed` when:
- a real attempt ended badly
- the current approach did not succeed
- review/validation rejected the result
- retry or redesign is now required

Examples:
- implementation broke acceptance criteria
- validation failed decisively
- budget exhausted
- provider retries exceeded limits

## Budget semantics
Budgets limit drift.
They should be treated as hard controls, not advisory hints.

Current executable behavior:
- `run_next_queue_job` fails queued restart attempts when an existing linked failed task already exhausted `budget.maxRetries`
- `run_next_queue_job` fails queued restart attempts when the current linked task validation outcome already exhausted `budget.maxFailedValidations`
- `run_next_queue_job` fails an active running job when `budget.maxRuntimeMinutes` is exceeded
- unsupported `maxCostUsd` and `maxFilesChanged` still block clearly because they are not yet executable in the bounded runner

Current bounded interpretation:
- exceeding retry budget -> `failed`
- exceeding runtime budget -> `failed`
- exceeding failed-validation budget -> `failed`
- unsupported cost/file-change budget -> `blocked`

If no budget is provided, the system should still apply conservative default limits in any future autonomy implementation.

## Stop-condition semantics
Stop conditions are explicit reasons to halt autonomous progress.

Current executable behavior:
- `approval_boundary_hit` is supported as the only executable `stop_conditions` token in the bounded runner
- queued jobs are blocked before start when `approvalRequired: true`
- active running jobs are blocked together with their linked task when `approvalRequired: true`
- other free-form `stop_conditions` still block clearly so stop intent is never silently ignored

Current bounded checks happen:
- before starting a job
- while polling an active running job
- before retrying a failed job with an existing linked task

Recommended stop-condition categories:
- safety stop
- validation stop
- budget stop
- scope stop
- approval stop

## Queue completion evidence
A job should not be marked `done` on narration alone.
Queue completion should rely on downstream evidence such as:
- task evidence
- validation report paths
- review decision summaries
- changed-file summaries

Queue status is higher-level than task status, but it should still be evidence-backed.

## Recommended notes for future implementation
Version 1 now includes minimal queue-runner linkage fields such as:
- `linkedTaskId`
- `packetId`
- `selectedModelId`
- `initialHandoffId`
- `startedAt`
- `finishedAt`
- `updatedAt`
- `notes`
- `lastRecoveryAction`
- `lastRecoveryReason`

Likely later additions still include:
- `createdAt`
- `retryCount`
- richer approval metadata
- richer stop-condition counters and budget telemetry

Those additions should still be introduced intentionally, not ad hoc.

## Examples

### Valid queued job
```json
{
  "version": 1,
  "paused": false,
  "activeJobId": null,
  "jobs": [
    {
      "id": "harness-009-queue-semantics",
      "goal": "Define queue blocked vs failed semantics",
      "priority": "high",
      "scope": "docs only under .pi/agent/docs",
      "status": "queued",
      "team": "planning",
      "workType": "docs_only",
      "domains": ["docs"],
      "allowedPaths": [".pi/agent/docs/queue_semantics.md"],
      "acceptanceCriteria": [
        "Queue semantics document clearly distinguishes blocked vs failed",
        "Queue examples stay aligned with the schema"
      ],
      "taskClass": "docs",
      "budget": {
        "maxRetries": 1,
        "maxRuntimeMinutes": 30
      },
      "stop_conditions": [
        "stop if schema changes are required outside docs"
      ],
      "dependencies": []
    }
  ]
}
```

### Valid blocked job
```json
{
  "version": 1,
  "paused": false,
  "activeJobId": null,
  "jobs": [
    {
      "id": "queue-job-approval-needed",
      "goal": "Implement queue runner",
      "priority": "medium",
      "scope": "runtime behavior under .pi/agent and scripts",
      "status": "blocked",
      "team": "build",
      "workType": "implementation",
      "domains": ["backend"],
      "allowedPaths": [".pi/agent/extensions/queue-runner.ts"],
      "acceptanceCriteria": [
        "Queue runner starts at most one job"
      ],
      "linkedTaskId": "task-queue-runner-1",
      "notes": [
        "Waiting for human approval before protected runtime-path edits."
      ],
      "dependencies": [
        "harness-009-queue-semantics"
      ]
    }
  ]
}
```

### Invalid job examples
Invalid because `priority` is unsupported:
```json
{
  "version": 1,
  "paused": false,
  "activeJobId": null,
  "jobs": [
    {
      "id": "bad-job",
      "goal": "Do something",
      "priority": "urgent",
      "status": "queued"
    }
  ]
}
```

Invalid because executable queue-runner inputs are missing required acceptance criteria:
```json
{
  "version": 1,
  "paused": false,
  "activeJobId": null,
  "jobs": [
    {
      "id": "bad-missing-acceptance",
      "goal": "Start a queued job without explicit acceptance",
      "priority": "medium",
      "status": "queued",
      "workType": "implementation",
      "allowedPaths": [".pi/agent/extensions/queue-runner.ts"]
    }
  ]
}
```

Invalid because `done` lacks actual execution path semantics:
```json
{
  "version": 1,
  "paused": false,
  "activeJobId": null,
  "jobs": [
    {
      "id": "bad-done-job",
      "goal": "Skipped work but marked done",
      "priority": "low",
      "status": "done"
    }
  ]
}
```

## Future evolution notes
Likely later extensions:
- richer budget schema
- queue timestamps and notes
- queue-to-task linkage
- explicit approval metadata
- multi-runner coordination rules

Those should remain additive and bounded.
The queue should stay deterministic and auditable.
