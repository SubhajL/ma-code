# Audit Logging Convention

This document defines the current audit logging contract for the repo-local harness.
It explains what is written to `logs/harness-actions.jsonl`, which extensions produce entries, and what evidence the log is intended to preserve.

## Purpose
The audit log exists to make foundation behavior more reconstructable.
Its goals are:
- preserve blocked and allowed mutation attempts
- preserve task lifecycle activity
- preserve branch/model/task context when available
- support later review, validation, and orchestration work

It is not a full analytics system.
It is a compact local evidence trail.

## Log location
- `logs/harness-actions.jsonl`

Format:
- one JSON object per line
- append-only under normal operation

## Rotation and retention
The active log at `logs/harness-actions.jsonl` is rotated when it would
exceed `HARNESS_AUDIT_LOG_MAX_BYTES` (default 5 MB) by the size of the
pending entry. Rotated files are renamed in place to
`logs/harness-actions.jsonl.YYYYMMDDTHHMMSSmmmZ-XXXX` (sortable UTC
millisecond timestamp plus a 4-hex random discriminator that prevents
same-tick collisions). `HARNESS_AUDIT_LOG_RETAIN` (default 5) controls
how many rotated files survive; older ones are pruned on each rotation.

- Set `HARNESS_AUDIT_LOG_MAX_BYTES=0` to disable rotation entirely
  (debug/forensics).
- SQLite remains the canonical audit store via the `audit_log` table —
  losing a pruned rotated JSONL never loses data.
- Single entries larger than `maxBytes` are written without splitting;
  the active file may briefly exceed the threshold by one line.

## Current producers
### `safe-bash.ts`
Current events include:
- blocked write/edit attempts
- blocked bash attempts
- confirmed warn-level bash attempts
- allowed mutating write/edit attempts
- allowed mutating bash attempts

### `till-done.ts`
Current events include:
- `task_update` actions
- blocked mutation attempts without an active runnable task
- `agent_end` reminders for still-open active tasks

## Core fields
Current entries may include:
- `ts`
- `extension`
- `action`
- `tool`
- `toolAction`
- `cwd`
- `branch`
- `modelId`
- `provider`
- `taskId`
- `taskStatus`
- `activeTaskId`
- `owner`
- `retryCount`
- `path`
- `resolvedPath`
- `command`
- `reasons`
- `details`

Not every producer writes every field.
But the current expectation is that entries should carry enough context to explain what happened without guessing from chat history alone.

## Interpretation rules
### Blocked shell/file events
A blocked `safe-bash.ts` entry should usually tell you:
- what tool was attempted
- what branch it was on
- what path or command was involved
- why it was blocked

### Allowed mutation events
An allowed mutation entry should usually tell you:
- what tool or command attempted mutation
- which branch it ran on
- which model/provider lane was active when available

### Task lifecycle events
A `till-done.ts` task event should usually tell you:
- which task was touched
- which action occurred
- what resulting status/active-task state was recorded
- retry count when relevant

## What this log is good for
Use it to answer questions like:
- why was a mutation blocked?
- did a main-branch mutation attempt happen?
- which task was active when a lifecycle action occurred?
- did a failed task get retried?
- what branch/model context was active for a mutation attempt?

## What this log is not
This log is not:
- the canonical task database
- the full validator report
- a replacement for coding logs or planning logs
- a guarantee that every future orchestration field already exists

## Relationship to other evidence
The audit log complements, but does not replace:
- `logs/coding/*.md`
- `reports/planning/*.md`
- `reports/validation/*.md`
- `reports/validation/*.json`

Use it as compact runtime evidence that can be referenced from those higher-level artifacts.

## Current limitations
Current known limitations:
- no dedicated packet/team IDs yet
- no separate query/report tooling yet
- no guarantee that all future extensions will emit the same metadata richness

Those are later improvements.
The current contract is intentionally compact and foundation-focused.
