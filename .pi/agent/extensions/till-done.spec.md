# till-done extension spec

## Purpose
Enforce visible task ownership and completion evidence before mutating work is considered done.

## Current architectural decision
- interaction layer should be tool-driven
- persistence layer should be file-backed JSON

## Core rules
- a mutating action must be linked to a task
- tasks must have acceptance criteria
- task status transitions must be explicit
- evidence is required before completion
- silent task clearing is blocked
- blocked work must remain visible

## Suggested hooks
- on user input: parse task intent and surface missing task context
- on tool call: block mutating actions if no task is active
- on tool result: attach useful evidence summaries
- on agent end: warn if active tasks are incomplete

## Suggested custom tool
- `task_update`
  - create task
  - claim task
  - update status
  - attach evidence
  - add note
  - reject illegal status transitions

## Version 1 scope
- enforce active task requirement before writes
- enforce evidence before completion
- keep state on disk in JSON
- do not implement a complex UI yet
