# Project Agent Rules

## Customize this file
This template is installed by the repo-local harness package.
Review and customize it for the target repo before relying on it.

## Core operating rules
- Never edit `main` directly.
- Use a branch or worktree for any code change.
- Prefer small, reversible changes.
- Do not widen scope silently.
- If blocked twice on the same task, escalate instead of improvising.

## Task discipline rules
- Do not mutate code or config unless there is an active task.
- A mutating action must be linked to an active task.
- A task must include clear acceptance criteria before execution begins.
- Do not mark a task complete without evidence.
- Blocked tasks must remain visible until explicitly resolved.

## Safety rules
- Do not modify secrets or protected paths unless explicitly instructed.
- Protected paths should include `.env*`, `.git/`, `node_modules/`, and `.pi/agent/state/runtime/`.
- Do not directly edit `.pi/agent/state/runtime/*.json` as the normal workflow.
- Do not mutate tracked files while on `main`.
- Do not disable tests or checks to make a task pass.

## Validation rules
- Completion requires validation appropriate to task risk.
- Prefer cheap/local validation first before provider-backed live validation.
- Use one live provider-backed validator run by default only when local evidence is insufficient.

## Project-specific follow-up
Add repo-specific rules here, for example:
- protected deploy/config paths
- domain-specific escalation rules
- branch/worktree conventions
- approval requirements unique to the target repo
