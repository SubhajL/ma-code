# Product Planning Workflow

This document defines the Phase 1 product-planning workflow for turning unclear goals into PRDs and bounded backlog slices.
It adapts useful grill/PRD/issues patterns into the existing Pi harness without adding new skill ports yet.

## Core policy
- Product planning flows from grill-style clarification to PRD to vertical-slice backlog.
- Vertical slices must be independently demonstrable or verifiable.
- Do not create implementation tasks until the goal, non-goals, success criteria, and open decisions are clear enough for a worker packet.
- Use current harness task packets and queue jobs as the execution surface; do not introduce a separate issue tracker dependency in Phase 1.

## Workflow stages
### 1. Grill-style clarification
Use this when requirements are fuzzy or the user is starting from a product idea.
Ask one focused question at a time, and prefer answering from codebase/docs discovery when the answer is already knowable.

Clarify:
- target users and actors
- problem statement
- desired outcome
- non-goals
- constraints and dependencies
- data/schema/API/UI impact
- acceptance signals
- rollout/backout expectations
- top failure modes

### 2. PRD synthesis
Convert clarified context into a PRD-style planning artifact.
A useful PRD should include:
- problem statement from the user's perspective
- solution from the user's perspective
- user stories
- implementation decisions at module/interface level
- testing decisions
- out of scope
- further notes and unresolved questions

Do not overfit the PRD to file paths or code snippets that may become stale.
Use domain language from repo docs, `CONTEXT.md`, ADRs, or discovered product vocabulary when available.

### 3. Vertical-slice backlog
Break the PRD into thin tracer-bullet slices.
Each slice should cut through the necessary layers end-to-end rather than creating broad horizontal tickets.

Each slice should state:
- title
- type: HITL or AFK
- blocked by
- user stories covered
- what to build
- acceptance criteria
- validation proof
- files or domains likely affected

Prefer many thin slices over a few thick slices.
Mark HITL when a slice needs human judgment, architecture approval, design approval, auth/secrets/deploy decisions, or ambiguous product behavior.
Mark AFK only when scope, validation, and safety boundaries are clear.

### 4. Task-packet handoff
Map approved slices into current harness task packets or queue jobs.
Preserve:
- goal and non-goals
- scope boundaries
- discovery summary
- files to inspect/modify when known
- expected proof
- wiring checks
- escalation instructions

## Validation expectations
- PRD quality is validated by completeness, clarity, and preserved decisions.
- Backlog quality is validated by independently demonstrable vertical slices.
- Implementation readiness is validated by task packets with acceptance criteria and proof expectations.

## Global skill ports
This workflow is now also available through global skill ports `g-grill`, `g-prd`, and `g-issues` in `packages/pi-g-skills/skills/`.
Use them when you want bounded clarification, PRD synthesis, or vertical-slice backlog planning without jumping straight into implementation.

## Phase boundary
Issue-tracker publishing integrations remain future work.
The current slice adds global skills and workflow guidance only; it does not add issue-tracker APIs or runtime queue automation here.
