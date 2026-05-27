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
- The `safe-bash` extension is a guardrail layer: it catches common-shape destructive shell patterns by regex, but it is not a sandbox and can be bypassed by `bash -c`, `eval`, base64-piped-to-`sh`, command substitution, and similar shell features. Do not treat it as a security boundary, and do not run commands you would not run yourself just because `safe-bash` did not block them.
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
- SQLite at `.pi/agent/state/runtime/pi.db` is the canonical persistence layer
  for task, queue, lease, and audit state. The legacy
  `.pi/agent/state/runtime/{tasks,queue,leases}.json` files are
  compatibility/export artifacts only; they auto-migrate into SQLite on first
  use and should not be treated as the source of truth.
- Direct raw JSON edits and direct SQLite mutation are both fallback or
  maintenance paths, not the normal operating path. Use the runtime task tools
  and helper scripts (`harness:status`, `harness:doctor`, etc.) instead.

## Architecture decisions
- Load-bearing architectural decisions live as Architecture Decision Records
  under [`docs/adr/`](docs/adr/README.md). Each ADR is numbered, dated, and has
  a Status of `Proposed`, `Accepted`, `Superseded`, or `Deprecated`.
- The ADR index ([`docs/adr/README.md`](docs/adr/README.md)) is the single
  authoritative current source of truth for the decisions it covers.
- **When this `AGENTS.md` (or any other doc) disagrees with an ADR, the ADR
  wins for the area it covers.** The other doc should be updated to match.
  If the ADR turns out to be wrong, write a new ADR that supersedes it; do
  not silently rewrite the existing record.
- Before changing top-level rules in `AGENTS.md`, the README, or operator
  docs in a way that contradicts an ADR, write or update the relevant ADR
  first so the decision is captured in the authoritative place.
