# Task Schema Semantics

This document defines the intended semantics of the task state model under:
- `.pi/agent/state/schemas/tasks.schema.json`
- `.pi/agent/state/runtime/tasks.json`

It turns the current JSON shape into an explicit contract for operators, runtime controls, validators, and future orchestration logic.

## Purpose
The task schema exists to support five things:
- bounded work tracking
- mutation gating
- ownership and accountability
- evidence-backed completion
- deterministic state transitions

The schema is not only a storage format.
It is the task-discipline contract for the harness.

## Scope
This document defines:
- top-level task state semantics
- per-task field semantics
- legal status transitions
- ownership rules
- evidence rules
- blocked and failed task behavior
- validator-facing expectations

It does not define:
- queue execution behavior
- team orchestration runtime
- worktree implementation details
- UI behavior

## State model
Current top-level shape:

```json
{
  "version": 1,
  "activeTaskId": null,
  "tasks": []
}
```

### Top-level fields
#### `version`
- must be `1`
- identifies the semantics in this document
- a future breaking change should increment the version intentionally

#### `activeTaskId`
- identifies the single task currently allowed to drive mutation in the active session
- must be either:
  - `null`, or
  - the `id` of one task in `tasks`
- should normally reference a task in `in_progress`
- must be cleared when no task is actively being executed

#### `tasks`
- append-oriented list of task records
- each task is the canonical record of status, ownership, acceptance criteria, evidence, and notes
- tasks should remain visible after completion or failure for auditability

## Per-task fields
Current task shape:

```json
{
  "id": "task-001",
  "title": "example",
  "owner": "assistant",
  "status": "queued",
  "taskClass": "implementation",
  "acceptance": ["..."],
  "evidence": [],
  "dependencies": [],
  "retryCount": 0,
  "validation": {
    "tier": "standard",
    "decision": "pending",
    "source": null,
    "checklist": null,
    "approvalRef": null,
    "updatedAt": null
  },
  "notes": [],
  "timestamps": {
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

### `id`
- stable unique identifier for the task
- must not be reused
- should be short, machine-safe, and human-referenceable
- recommended style:
  - `task-001`
  - `harness-008-a`
  - `docs-validation-20260417-01`

### `title`
- one-line description of the bounded task
- should describe the deliverable, not the entire project
- should be specific enough that a reviewer can compare output to intent

Good:
- `Define task schema transition rules`
- `Document queue blocked vs failed behavior`

Bad:
- `Improve harness`
- `Do phase C`

### `owner`
- current accountable executor for the task
- may be `null` only before claim or after explicit release
- when `status` is `in_progress`, `owner` must not be `null`
- ownership represents accountability, not necessarily exclusive authorship of every file line

Recommended values:
- human name
- agent/role name
- bounded worker identifier

### `status`
Allowed statuses:
- `queued`
- `in_progress`
- `review`
- `blocked`
- `done`
- `failed`

Status meaning:
- `queued`: defined but not yet being executed
- `in_progress`: active execution state; mutation is allowed only under this state when task discipline checks pass
- `review`: implementation work is paused and waiting for review/validation/completion decision
- `blocked`: cannot proceed without external clarification, dependency resolution, or approval
- `done`: completion accepted with evidence
- `failed`: task ended unsuccessfully and should not be treated as pending work without an explicit retry/reopen decision

### `taskClass`
- machine-readable classification for completion-gate expectations
- current task classes:
  - `research`
  - `docs`
  - `implementation`
  - `runtime_safety`
- the task class determines:
  - validation tier
  - allowed validation source
  - which checklist categories may be `not_applicable`
  - whether validator-backed proof is required before `done`

### `acceptance`
- list of concrete acceptance criteria
- minimum one item is required
- each item should be testable, reviewable, or evidence-checkable
- acceptance must exist before task start

Good criteria:
- `creates .pi/agent/docs/task_schema_semantics.md`
- `documents legal task status transitions`
- `keeps future queue execution out of scope`

Weak criteria:
- `looks good`
- `done correctly`
- `works somehow`

### `evidence`
- list of proof entries supporting progress or completion
- empty evidence is allowed while a task is still being worked
- `done` requires non-empty evidence
- evidence entries are currently strings for version 1 simplicity

Version 1 evidence convention:
- each item should point to concrete proof such as:
  - changed file path
  - validation report path
  - command result summary
  - review decision summary
  - wiring verification summary when relevant
  - discovery path summary when it materially affected planning or validation
  - known gap summary

Recommended style:
- `Changed files: .pi/agent/docs/task_schema_semantics.md`
- `Discovery: Auggie unavailable; used read + rg on schema and runtime files`
- `Validation: file written and read back successfully`
- `Wiring: verified route registration in server bootstrap`
- `Known gap: no runtime validator yet for schema transition logic`

### `dependencies`
- list of task IDs that must be completed or resolved before this task can finish normally
- dependencies should refer to other tasks, not free-form prose
- a task may be created before its dependencies are done, but it should not move to `done` if required dependencies are unresolved

### `retryCount`
- number of explicit retry attempts after a failure/block/rejection decision
- must start at `0`
- increments only when the task is deliberately retried, not on every edit
- helps recovery logic decide between retry, reroute, rollback, or stop

### `validation`
- machine-readable completion-gate state for the task
- current fields:
  - `tier`: `lightweight` | `standard` | `strict`
  - `decision`: `pending` | `pass` | `fail` | `blocked` | `overridden`
  - `source`: `review` | `validator` | `override` | `null`
  - `checklist`: per-category outcomes for `acceptance`, `tests`, `diff_review`, and `evidence`
  - `approvalRef`: explicit approval metadata for manual overrides when used
  - `updatedAt`: last validation/override timestamp
- `done` now requires `validation.decision` to be `pass` or `overridden`
- docs/research tasks still require visible validation proof, but may use the lighter review-backed path with `not_applicable` checklist items where policy allows

### `notes`
- append-only operational notes
- used for blockers, review feedback, escalation context, or recovery observations
- should not replace acceptance or evidence
- should preserve important decision context rather than ephemeral chat commentary

Recommended note styles:
- `Blocked: waiting for human decision on queue priority semantics`
- `Review: validator requested exact transition table`
- `Recovery: retry with stronger model approved`

### `timestamps`
Required:
- `createdAt`
- `updatedAt`

Optional:
- `startedAt`
- `completedAt`

Semantics:
- `createdAt`: when the task record was created
- `updatedAt`: last state mutation time
- `startedAt`: first time task entered `in_progress`
- `completedAt`: time task entered terminal accepted state, typically `done`; may also be recorded for `failed` if desired by implementation later

Timestamps should use one consistent machine-readable format, preferably ISO 8601.

## Current tool-driven surface
For the current repo-local harness slice, normal task mutation should happen through `task_update`.
Current actions are:
- `show`
- `create`
- `claim`
- `start`
- `note`
- `evidence`
- `review`
- `requeue`
- `block`
- `done`
- `fail`

Current runtime enforcement now covers:
- no mutation without one active runnable task
- no direct `in_progress -> done`
- `review` clears `activeTaskId` for the task being handed off
- `failed -> in_progress` retry increments `retryCount`
- `done` requires `review` status plus evidence
- `done` is blocked when dependencies are unresolved
- `start` is blocked when dependencies are missing, blocked, or failed

## Ownership rules

### Claiming
A task may be claimed only when:
- the task exists
- the intended owner is explicit
- acceptance criteria already exist

### Starting
A task may enter `in_progress` only when:
- `owner` is not `null`
- `acceptance` is non-empty
- required dependencies are not missing, blocked, or failed in the current runtime gate

### Releasing
A task owner may be cleared only when:
- the task returns to `queued`, or
- the task is explicitly handed off, or
- human/operator intervention reassigns it

### Single active task rule
For the current harness slice, the session should have at most one `activeTaskId`.
That keeps mutation gating simple and reviewable.
Parallel execution should be handled through separate worktrees or sessions later, not by allowing one session to mutate under multiple active tasks at once.

## Legal status transitions

### Allowed transition table
| From | To | Allowed | Notes |
|---|---|---:|---|
| `queued` | `in_progress` | yes | requires owner and acceptance |
| `queued` | `blocked` | yes | if task cannot begin due to external blocker |
| `queued` | `failed` | yes | rare; use when task definition is invalid or abandoned by decision |
| `queued` | `done` | no | cannot complete work that never started |
| `queued` | `review` | no | review requires execution output |
| `in_progress` | `review` | yes | preferred path after implementation or bounded execution |
| `in_progress` | `blocked` | yes | if execution hits blocker |
| `in_progress` | `failed` | yes | if execution attempt ends unsuccessfully |
| `in_progress` | `queued` | yes | only for explicit reset/requeue decision |
| `in_progress` | `done` | no | completion should pass through review/validation decision flow |
| `review` | `done` | yes | requires sufficient evidence |
| `review` | `in_progress` | yes | if changes are requested |
| `review` | `blocked` | yes | if review finds external blocker |
| `review` | `failed` | yes | if review concludes the task should not continue as-is |
| `blocked` | `queued` | yes | when blocker is removed but work has not resumed |
| `blocked` | `in_progress` | yes | when blocker is removed and work resumes directly |
| `blocked` | `failed` | yes | if blocker becomes terminal |
| `blocked` | `done` | no | blockers must be resolved first |
| `done` | any other state | no by default | require explicit reopen/new task policy later |
| `failed` | `queued` | yes | explicit retry/requeue decision |
| `failed` | `in_progress` | yes | explicit retry with owner |
| `failed` | `done` | no | must be retried/reviewed first |

### Terminal states
For version 1, treat these as terminal by default:
- `done`
- `failed`

If reopening is needed, prefer one of:
- create a new follow-up task referencing the prior task ID, or
- use an explicit retry/requeue transition from `failed`

Avoid silently moving `done` back into active execution.

## Review and completion rules

### Entering `review`
A task should enter `review` when:
- bounded implementation work is complete enough for inspection, or
- a docs/research task is ready for completion review, or
- validator/reviewer evidence is now required before acceptance

### Entering `done`
A task may enter `done` only when:
- the task is already in `review`
- acceptance criteria are satisfied
- evidence is present
- unresolved blockers are absent
- dependencies are resolved
- reviewer/validator requirements for the task class are met

For the current runtime gate, the hard-enforced minimum is:
- `status === review`
- non-empty `evidence`
- no unresolved dependency IDs
- `validation.decision === pass` or `validation.decision === overridden`
- task-class-specific validation source/checklist requirements are satisfied before that validation result can be recorded

### Entering `failed`
Use `failed` when:
- the task attempt produced an unusable outcome
- retry was rejected or deferred
- a validator/reviewer concludes the task should not be accepted
- the task goal became invalid under current constraints

### Entering `blocked`
Use `blocked` when progress cannot continue because of:
- ambiguity that needs human clarification
- dependency not yet resolved
- permission/approval requirement
- provider/tool instability
- repo-state conflict

A blocked task stays visible until resolved.

## Evidence rules

### Minimum evidence for `done`
A completed task should record evidence covering:
- changed files
- relevant validation or test output when appropriate
- short explanation of what was done
- unresolved risks or known gaps

This aligns with `AGENTS.md`.

### Evidence quality rule
An agent claim is not evidence by itself.
Evidence should point to artifacts, commands, reports, or review outcomes.

### Version 1 evidence simplicity
Because `evidence` is a string array in version 1:
- keep entries compact
- prefer artifact references over prose essays
- allow logs/reports to carry the deeper detail

If richer evidence becomes necessary later, it should be a versioned schema evolution, not an ad hoc shape change.

## Blocked-task semantics
A blocked task should usually include:
- `status: blocked`
- at least one `notes` entry describing the blocker
- unchanged retained evidence, if any
- `activeTaskId` cleared unless the runtime intentionally keeps the task active for immediate human intervention

Blocked does not mean forgotten.
It means visible and waiting.

## Failed-task semantics
A failed task should usually include:
- `status: failed`
- a note explaining why the attempt failed
- current `retryCount`
- evidence of the failed validation or failed attempt when available

Failed does not imply delete.
It preserves recovery context.

## Validator-facing expectations
Validators should be able to check the following deterministically:
- required fields exist
- no `in_progress` task lacks owner or acceptance
- `activeTaskId` is `null` or references a real task
- `done` tasks contain evidence and come from `review`
- `done` tasks carry a visible validation result (`pass` or `overridden`)
- docs/research tasks use the lighter allowed validation source rather than skipping proof
- blocked tasks have an explanatory note
- required `dependencies`, `retryCount`, `taskClass`, and `validation` fields are present
- illegal transitions are not silently allowed by runtime tools

## Examples

### Valid queued task
```json
{
  "id": "harness-008-task-semantics",
  "title": "Define task schema semantics",
  "owner": null,
  "status": "queued",
  "taskClass": "implementation",
  "acceptance": [
    "documents legal task state transitions",
    "defines evidence rules for version 1"
  ],
  "evidence": [],
  "dependencies": [],
  "retryCount": 0,
  "validation": {
    "tier": "standard",
    "decision": "pending",
    "source": null,
    "checklist": null,
    "approvalRef": null,
    "updatedAt": null
  },
  "notes": [],
  "timestamps": {
    "createdAt": "2026-04-18T10:00:00Z",
    "updatedAt": "2026-04-18T10:00:00Z"
  }
}
```

### Valid in-progress active task
```json
{
  "version": 1,
  "activeTaskId": "harness-008-task-semantics",
  "tasks": [
    {
      "id": "harness-008-task-semantics",
      "title": "Define task schema semantics",
      "owner": "assistant",
      "status": "in_progress",
      "taskClass": "implementation",
      "acceptance": [
        "documents legal task state transitions",
        "defines evidence rules for version 1"
      ],
      "evidence": [],
      "dependencies": [],
      "retryCount": 0,
      "validation": {
        "tier": "standard",
        "decision": "pending",
        "source": null,
        "checklist": null,
        "approvalRef": null,
        "updatedAt": null
      },
      "notes": [],
      "timestamps": {
        "createdAt": "2026-04-18T10:00:00Z",
        "updatedAt": "2026-04-18T10:05:00Z",
        "startedAt": "2026-04-18T10:05:00Z"
      }
    }
  ]
}
```

### Invalid examples
Invalid because owner is missing for in-progress:
```json
{
  "id": "bad-task",
  "title": "Bad task",
  "owner": null,
  "status": "in_progress",
  "taskClass": "implementation",
  "acceptance": ["do work"],
  "evidence": [],
  "dependencies": [],
  "retryCount": 0,
  "validation": {
    "tier": "standard",
    "decision": "pending",
    "source": null,
    "checklist": null,
    "approvalRef": null,
    "updatedAt": null
  },
  "notes": [],
  "timestamps": {
    "createdAt": "2026-04-18T10:00:00Z",
    "updatedAt": "2026-04-18T10:01:00Z"
  }
}
```

Invalid because done has no evidence, bypasses review, and lacks validation proof:
```json
{
  "id": "bad-done-task",
  "title": "Pretend complete",
  "owner": "assistant",
  "status": "done",
  "taskClass": "implementation",
  "acceptance": ["finish work"],
  "evidence": [],
  "dependencies": [],
  "retryCount": 0,
  "validation": {
    "tier": "standard",
    "decision": "pending",
    "source": null,
    "checklist": null,
    "approvalRef": null,
    "updatedAt": null
  },
  "notes": [],
  "timestamps": {
    "createdAt": "2026-04-18T10:00:00Z",
    "updatedAt": "2026-04-18T10:10:00Z",
    "completedAt": "2026-04-18T10:10:00Z"
  }
}
```

## Future evolution notes
Possible later extensions:
- structured evidence objects instead of strings
- explicit reopen state or reopen metadata
- richer dependency resolution status
- task packet linkage
- per-task worktree reference

Those should be additive and versioned.
They should not silently break version 1 consumers.
