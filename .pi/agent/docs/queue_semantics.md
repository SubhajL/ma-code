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
  - `maxCostUsd`
  - `maxFilesChanged`
- values should be conservative and reviewable

### `stop_conditions`
- optional list of conditions that should force stop, pause, or escalation
- should be explicit and reviewable

Examples:
- `stop after 2 failed validations`
- `stop if protected path access is required`
- `stop if scope expands beyond docs`

### `dependencies`
- list of job IDs that must resolve before this job should run normally
- dependency IDs should refer to other queue jobs, not free-form prose
- unresolved dependencies should keep the job from moving into `running`

## Lifecycle semantics

### `queued`
A job in `queued` is waiting for selection.
It may still be ineligible to run if:
- dependencies are unresolved
- required approval is missing
- the queue is paused

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
- no stop condition precludes starting
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

Recommended budget interpretation:
- exceeding retry budget -> `failed` or `blocked` with escalation
- exceeding runtime budget -> stop and escalate
- exceeding cost budget -> stop and escalate
- exceeding file-change budget -> stop and re-scope

If no budget is provided, the system should still apply conservative default limits in any future autonomy implementation.

## Stop-condition semantics
Stop conditions are explicit reasons to halt autonomous progress.
They should be checked:
- before starting a job
- during recovery decisions
- before retrying a failed job

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
Version 1 deliberately keeps the queue minimal.
Likely later additions include:
- `createdAt`
- `updatedAt`
- `startedAt`
- `completedAt`
- `notes`
- `retryCount`
- linkage to generated task IDs
- approval metadata

Those additions should be introduced intentionally, not ad hoc.

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
  "activeJobId": "queue-job-approval-needed",
  "jobs": [
    {
      "id": "queue-job-approval-needed",
      "goal": "Implement queue runner",
      "priority": "medium",
      "scope": "runtime behavior under .pi/agent and scripts",
      "status": "blocked",
      "team": "build",
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
