# Project Agent Rules

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
- An active task must include acceptance criteria before mutation starts.
- Do not mark a task complete without evidence.
- Completion requires recorded evidence, not only a claim.
- If a task is blocked, keep it visible and record the blocker.
- Blocked tasks must remain visible until explicitly resolved.

## Skill workflow rules
- For planning, design, or implementation-plan requests, explicitly use `g-planning`.
- For implementation, debugging, or code-change requests, explicitly use `g-coding`.
- For review, verification, or quality-fix requests, explicitly use `g-check`.
- For architecture, drift, or as-is system review requests, explicitly use `g-review`.
- When a task matches one of these skills, read the relevant `SKILL.md` before proceeding.
- If guaranteed skill loading matters, explicitly invoke `/skill:<name>` instead of relying on auto-match alone.

## Evidence rules
A task is not complete unless it includes:
- changed files
- relevant validation or test output when appropriate
- a short explanation of what was done
- unresolved risks or known gaps

## Safety rules
- Do not run destructive shell commands.
- Do not modify `.env*`, secrets, or protected files unless explicitly instructed.
- Protected paths include `.env*`, `.git/`, `node_modules/`, and `.pi/agent/state/runtime/`.
- Do not directly edit `.pi/agent/state/runtime/*.json` as the normal workflow; use runtime task tools.
- Do not mutate tracked files while on `main`.
- Destructive shell actions must be blocked or explicitly confirmed by runtime controls.
- Do not disable tests or checks to make a task pass.
- Do not rewrite Git history or force-push unless explicitly approved.

## Human approval rules
Human approval is required before:
- deleting large file sets
- destructive git history changes
- force pushing
- modifying protected paths
- changing auth, secrets, or deployment-critical config
- bypassing runtime safety or task-discipline controls

## Scope and escalation rules
Escalate when:
- requirements are ambiguous
- multiple domains must change together
- auth, schema, infra, or deployment scope expands unexpectedly
- evidence is weak or contradictory
- two workers would need overlapping file ownership
- runtime/provider behavior becomes unreliable

## Worktree and branch rules
- Use isolated worktrees for parallel worker execution unless a shared worktree is explicitly approved.
- Branch and worktree names should map to bounded jobs or task IDs.
- Do not merge or present work as merge-ready unless completion gates are satisfied.

## Validation rules
- Completion requires validation appropriate to task risk.
- Reviewer and validator outputs take priority over worker self-reports.
- Research-only or docs-only tasks may use lighter validation, but still require visible evidence.
- Prefer cheap/local validation first before provider-backed live validation when both can answer the question.
- Use one live provider-backed validator run by default when live proof is needed.
- Repeated live `pi ...` validator reruns require explicit human approval unless there is clear flake suspicion that justifies the extra spend.
- If repeated live validation is justified, state why the rerun is needed and why cheaper evidence is insufficient.

## Task architecture note
- Normal task interaction should be tool-driven.
- JSON is the persistence layer for task and queue state.
- Direct raw JSON edits are a fallback or maintenance path, not the normal operating path.
