# Worktree Isolation Policy

This document defines the intended worktree and branch isolation policy for multi-worker execution.
It turns the high-level safety rules in `AGENTS.md` into a more operational contract.

## Purpose
Worktree isolation exists to prevent workers from stomping on each other’s changes.
Its goals are:
- one bounded change lane per worker or job by default
- predictable branch and worktree naming
- explicit shared-worktree exceptions
- safe cleanup and review preparation

## Scope
This document defines:
- when worktrees are required
- when sharing is allowed
- naming conventions
- ownership and cleanup rules
- merge/review preparation expectations

It does not define:
- exact helper script implementation
- CI behavior
- hosting-provider branch protection rules

## Baseline policy
The baseline rules from `AGENTS.md` remain in force:
- never edit `main` directly
- use a branch or worktree for any code change
- use isolated worktrees for parallel worker execution unless shared use is explicitly approved
- branch and worktree names should map to bounded jobs or task IDs

This document makes those rules more specific.

## Core isolation rule
Default rule:
- **one worker = one worktree = one bounded job or task packet**

This keeps ownership, cleanup, and evidence simpler.

Do not share a mutable worktree by default.
Shared worktrees are the exception, not the norm.

## Canonical decision table
| Situation | Required policy | Why |
|---|---|---|
| One worker mutates tracked files | dedicated branch or worktree required | keeps ownership and review evidence clear |
| Two or more workers may mutate in parallel | separate worktrees required | avoids silent file stomping |
| One lane mutates and another lane is read-only/advisory | shared worktree allowed only by explicit bounded exception | low-risk inspection can stay cheaper |
| Same files or adjacent file regions are likely to overlap | escalate instead of sharing | overlap risk beats convenience |
| Review/recovery needs to inspect a mutable lane | prefer separate inspection lane or read-only use | avoids perturbing the original lane |
| Work is on `main` | not allowed for normal mutation | bounded branches/worktrees are mandatory |

## When a dedicated worktree is required
A worker should get a dedicated worktree when:
- two or more workers may run in parallel
- the task changes tracked files
- the task has a distinct job ID or task ID
- the worker may need to commit, checkpoint, or inspect git state independently
- a quality or recovery lane needs to inspect work without perturbing another lane

## When sharing is allowed
A shared worktree is allowed only when all of the following are true:
- the work is bounded and low-risk
- only one lane is actually mutating files
- the other participant is read-only or advisory
- file ownership is non-overlapping or trivial
- a human or orchestrator explicitly approves the shared arrangement

Typical allowed examples:
- planning lead and research/docs worker doing read-heavy repo inspection
- quality reviewer inspecting a stable finished branch without mutating it

Typical disallowed examples:
- two build workers both editing the same feature branch
- one worker refactoring files while another updates adjacent code in the same worktree
- recovery and build both modifying the same runtime file set concurrently

## Branch naming policy
Branches should map to bounded work, not vague goals.

Recommended branch format:
- `<repo-or-stream>/<task-or-job-id>-<short-slug>`

Examples:
- `ma-code/harness-008-task-schema`
- `ma-code/harness-021-task-packets`
- `ma-code/docs-validation-architecture`

Branch names should:
- be stable enough for logs and reports
- reflect one bounded piece of work
- avoid generic names like `fixes`, `work`, `stuff`, `temp`

## Worktree naming policy
Worktree names should map to the same bounded unit as the branch.

Recommended worktree directory pattern:
- `<repo>.worktrees/<task-or-job-id>-<short-slug>`

Examples:
- `ma-code.worktrees/harness-008-task-schema`
- `ma-code.worktrees/harness-020-team-activation`

If a worker identity needs to be visible, append it conservatively:
- `ma-code.worktrees/harness-021-backend-worker`
- `ma-code.worktrees/harness-021-validator`

Avoid names that reveal no scope, such as:
- `test1`
- `tmp-worktree`
- `misc`

## Mapping rules
Each mutable worktree should map clearly to:
- one queue job, or
- one task, or
- one bounded orchestration packet

Recommended references to preserve:
- worktree path
- branch name
- task/job/packet ID
- owner or lane

This mapping should show up in logs or task notes once worktree helpers exist.

## Ownership rules
Each mutable worktree should have one clear owner at a time.
Ownership means:
- accountable for mutations in that worktree
- responsible for keeping scope bounded
- responsible for cleanup or handoff notes

Ownership may transfer, but only with explicit handoff.
Do not allow ambiguous simultaneous ownership.

## File ownership rules
Even with separate worktrees, file ownership still matters.

### Default rule
Only one active mutation lane should own a given tracked file region at a time.

### Allowed split
Multiple workers may work in parallel only when:
- their file sets do not overlap, or
- overlap is intentionally coordinated and low-risk, or
- a human approves the shared boundary

### Escalate when
Escalate instead of improvising when:
- two workers need the same file
- one worker needs a cross-domain refactor that affects another worker’s lane
- queue or orchestration pressure encourages unsafe parallelism

## Worktree lifecycle

### 1. Create
Before mutation begins:
- choose a bounded task/job/packet
- create or select a matching branch
- create a matching worktree when parallel isolation is needed
- record the mapping in the task/job evidence trail when appropriate

### 2. Execute
During execution:
- keep the worktree scoped to the assigned work
- do not absorb unrelated fixes
- keep notes about blockers or unexpected scope growth

### 3. Validate
Before claiming completion:
- run validation appropriate to the task risk
- ensure evidence references the correct worktree/branch outputs when relevant
- make sure the lane is ready for review without hidden changes

### 4. Handoff or review prep
Before review or merge-ready status:
- summarize changed files
- summarize validation outcome
- note unresolved risks
- ensure the worktree is not carrying unrelated local state

### 5. Cleanup
After acceptance or explicit abandonment:
- remove no-longer-needed worktrees
- preserve any needed evidence first
- do not delete a worktree still needed for review, recovery, or rollback inspection

## Cleanup rules
Cleanup should be conservative.
Do not remove a worktree when:
- review is pending
- recovery may need to inspect it
- evidence has not been captured
- uncommitted local state has not been intentionally handled

A worktree may be cleaned up when:
- completion gates are satisfied and review is complete, or
- the work is abandoned and evidence of abandonment is recorded, or
- the worktree was purely temporary and no longer contains needed state

Large or destructive cleanup actions still require human approval when they cross repo safety boundaries.

## Shared-worktree exception policy
If a shared worktree is explicitly approved, the handoff or packet should record:
- why sharing is acceptable
- who may mutate and who must stay read-only
- what file boundaries apply
- when the shared arrangement expires

If that clarity is missing, do not share the worktree.

## Review and merge-ready policy
A worktree is not merge-ready just because it exists cleanly.
Before something is presented as merge-ready:
- completion gates must be satisfied
- validation appropriate to the risk must be complete
- reviewer/validator outputs take priority over worker self-report
- unresolved risks must be visible

This aligns with `AGENTS.md`.

## Main branch protection
The worktree policy reinforces these rules:
- do not mutate tracked files while on `main`
- do not present direct main edits as normal workflow
- use bounded branches/worktrees instead

If any helper later automates worktree creation, it should hard-fail or loudly block operations that would route mutation onto `main`.

## Recommended helper capabilities
When worktree helper scripts are added later, they should support:
- create worktree
- cleanup worktree
- predictable branch naming
- status inspection
- review/merge prep

But helper convenience must not weaken the policy.
The policy comes first.

## Practical examples

### Good isolation example
- packet A: backend worker edits API files in `ma-code.worktrees/harness-021-backend`
- packet B: docs worker edits docs in `ma-code.worktrees/harness-021-docs`
- quality team reviews outputs after both packets finish

Why this is good:
- clear boundaries
- separate ownership
- easier cleanup and evidence

### Bad isolation example
- backend worker and infra worker both edit the same runtime extension in one shared worktree
- no explicit handoff or file boundary exists

Why this is bad:
- overlapping ownership
- ambiguous responsibility
- high collision risk

### Acceptable shared example
- planning lead and research worker inspect repo files in one temporary read-only worktree
- only planning lead may write notes/doc artifacts
- arrangement is short-lived and explicit

Why this can be acceptable:
- one mutator at most
- bounded scope
- low collision risk

## Interaction with other architecture docs
This policy depends on and supports:
- task semantics for bounded work ownership
- team orchestration for packet-to-worker mapping
- validation/recovery architecture for review and rollback decisions

It is especially important before:
- parallel build execution
- quality/recovery inspection lanes
- long-running queue autonomy

## Current closure status
For the current repo-local harness slice, this document is the canonical worktree policy.
That means:
- the decision rules above are final enough to govern planning, review, and future worker routing
- helper scripts are a later convenience layer, not a blocker for policy completeness
- if a case is not clearly allowed here, escalate instead of improvising

## Future evolution notes
Likely later additions:
- helper script interface and naming flags
- task/job-to-worktree metadata storage
- automated stale-worktree inspection
- review bundle preparation

Those should preserve the core rule:
- isolate mutable work by default
- share only by explicit bounded exception
