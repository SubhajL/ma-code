# Product Planning Workflow

This document defines the Phase 1 product-planning workflow for turning unclear goals into PRDs and bounded backlog slices.
It adapts useful grill/PRD/issues patterns into the existing Pi harness without adding new skill ports yet.

## Core policy
- Product planning flows from grill-style clarification to PRD to vertical-slice backlog.
- Vertical slices must be independently demonstrable or verifiable.
- Do not create implementation tasks until the goal, non-goals, success criteria, and open decisions are clear enough for a worker packet.
- Use current harness task packets and queue jobs as the execution surface; do not introduce a separate issue tracker dependency in Phase 1.
- Intake trigger details live in `.pi/agent/docs/intake_policy.md` and the machine-readable trigger matrix `.pi/agent/intake/intake-trigger-policy.json`.
- Every major feature should keep durable planning artifacts under `docs/initiatives/<feature-slug>/`.
- Product-slice phase order is captured in `docs/initiatives/<feature-slug>/slice-plan.json` using `.pi/agent/state/schemas/product-slice-plan.schema.json`; see `.pi/agent/docs/product_slice_lifecycle.md`.
- Product slice lifecycle is Phase 2 planning/DAG only: it does not call Stitch, write queue state, create tasks, dispatch workers, or generate FE/BE packets.
- Use `npm run harness:product-intake -- --slug <feature-slug> --description "..." --dry-run` to validate product-intake inputs and planned files without writing.
- Use `npm run harness:product-intake -- --slug <feature-slug> --description "..." --apply` as the safe Phase 1 entry point for major product work; it captures `intake.json`, blocks vague descriptions with focused clarification questions, and creates PRD/backlog/decisions scaffolds only when intake is ready for PRD.
- `harness:product-intake` reuses `harness:init-feature` for ready apply-mode scaffolds without changing the existing `harness:init-feature` command. Use `npm run harness:init-feature -- --slug <feature-slug>` only when you intentionally want the lower-level initiative-folder scaffold.
- Add `--domains frontend` or `--domains backend` to the lower-level scaffold only when the feature actually needs domain docs.

## Workflow stages
### 1. Grill-style clarification
Use this when requirements are fuzzy or the user is starting from a product idea.
Ask one focused question at a time, and prefer answering from codebase/docs discovery when the answer is already knowable.

After `harness:init-feature` creates the initiative folder, the helper's success output can suggest the bounded next skills `/skill:g-grill`, `/skill:g-prd`, and `/skill:g-issues` as informational next steps only.

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
PRD/backlog happen before Stitch. Phase 1 product intake never calls Stitch, never creates task packets, and never dispatches queue jobs.

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
- assigned domain owner when the slice is ready for task-packet handoff
- explicit escalation or multi-lane note for mixed frontend/backend slices

Prefer many thin slices over a few thick slices.
Mark HITL when a slice needs human judgment, architecture approval, design approval, auth/secrets/deploy decisions, or ambiguous product behavior.
Mark AFK only when scope, validation, and safety boundaries are clear.

### 4. Product slice lifecycle plan
After PRD/backlog slicing and before Stitch/FE/BE work, create or update `docs/initiatives/<feature-slug>/slice-plan.json` from `docs/initiatives/TEMPLATE/slice-plan.json`.

The Phase 2 product-slice lifecycle enforces this required phase order for each slice: `stitch_prompt`, `stitch_generation`, `screen_approval`, `slice_contract`, `fe_implementation`, `fe_validation`, `be_implementation`, `be_validation`, `quality`.

Use the pure helper in `.pi/agent/extensions/product-slice-lifecycle.ts` to validate a slice plan and decide whether a requested phase transition is legal. Same-slice parallel phase requests are forbidden, skipped phases are blocked, and `be_implementation` is blocked until `fe_validation` is complete.

This is a product planning/DAG gate only. It must not write queue state, create runtime tasks, call Stitch, dispatch workers, or generate FE/BE packets.

### 5. Phase 3 Stitch prompt generation
After PRD/backlog slicing and product slice lifecycle planning, generate a prompt-only Stitch prompt artifact for each UI-facing slice before any screen generation. Use `npm run harness:stitch-prompt -- --initiative <feature-slug> --slice <slice-id> --dry-run` to inspect deterministic prompt output without writing, and `--apply` to write only `docs/initiatives/<feature-slug>/stitch-prompts/<slice-id>.prompt.md` plus stable metadata.

Phase 3 Stitch prompt generation is prompt-only: it does not call Stitch, does not create task packets, does not create queue jobs, does not dispatch workers, and does not implement frontend or backend code. Non-UI slices are blocked unless an operator explicitly passes `--allow-non-ui`. See `.pi/agent/docs/stitch_prompt_generation.md`.

### 6. Phase 4 mock Stitch artifact generation
After human prompt review, generate a mock-only screen artifact for each UI-facing slice before screen approval. Use `npm run harness:stitch-artifact -- --initiative <feature-slug> --slice <slice-id> --dry-run` to inspect deterministic mock artifact output without writing, and `--apply` to write only `docs/initiatives/<feature-slug>/screen-artifacts/<slice-id>.mock-screen.json` plus a Markdown summary.

Phase 4 mock Stitch artifact generation is mock-only: it consumes Phase 3 prompt metadata, validates source hashes, does not call Stitch, does not create task packets, does not create queue jobs, does not dispatch workers, and does not implement frontend or backend code. It records `nextAllowedPhase: screen_approval` and `nextBlockedUntil: human_artifact_review`. See `.pi/agent/docs/stitch_artifacts.md`.

Phase 13 live Stitch generation is additive and explicit. Mock mode remains default. Use `npm run harness:live-stitch-artifact -- --initiative <feature-slug> --slice <slice-id> --dry-run` to validate prompt metadata and planned live call shape without writing, and `--apply --approval-ref operator-approved-live-stitch:<ref>` only after operator approval and environment/runtime auth are present. Live output writes managed payloads under `.pi/agent/artifacts/stitch/` and durable summaries under screen artifacts; generated live output still requires human approval before downstream phases. See `.pi/agent/docs/live_stitch_adapter.md`.

### 7. Phase 5 screen artifact approval
After human artifact review, approve or reject the mock screen artifact before FE implementation. Use `npm run harness:screen-approval -- status --initiative <feature-slug> --slice <slice-id>` to inspect approval state, `approve --by <reviewer> --note <text>` to write an approved sidecar, and `reject --by <reviewer> --reason <text>` to write a rejected sidecar.

Phase 5 screen artifact approval writes only `docs/initiatives/<feature-slug>/screen-artifacts/<slice-id>.approval.json`. It binds human approval to the current mock artifact hash, requires reviewer identity and notes for approval, requires a rejection reason for rejection, does not call Stitch, does not create task packets, does not create queue jobs, does not dispatch workers, does not write protected runtime JSON, and does not implement frontend or backend code. See `.pi/agent/docs/screen_artifact_approval.md`.

### 8. Phase 6 slice contract generation
After hash-bound screen artifact approval and before FE implementation, generate a shared slice contract. Use `npm run harness:slice-contract -- --initiative <feature-slug> --slice <slice-id> --dry-run` to inspect deterministic JSON/Markdown output without writing, and `--apply` to write only `docs/initiatives/<feature-slug>/contracts/<slice-id>.contract.json` plus a Markdown summary.

Phase 6 slice contract generation requires the current screen artifact approval sidecar to be `approved` and hash-matched to the mock artifact. It captures UI states, required data, API/data placeholders, errors, auth assumptions, mock plan, TDD seeds, and out-of-scope notes. It does not create task packets, does not create handoffs, does not create queue jobs, does not start worker sessions, does not dispatch workers, does not write protected runtime JSON, and does not implement frontend or backend code. See `.pi/agent/docs/slice_contracts.md`.

### 9. Phase 8 frontend packet generation
After Phase 6 produces a current contract, generate a preview-only FE packet for UI-facing slices. Use `npm run harness:fe-packet -- --initiative <feature-slug> --slice <slice-id> --dry-run` to inspect the generated `frontend_worker` packet without writing, and `--apply` to write only `docs/initiatives/<feature-slug>/packets/<slice-id>.frontend.packet.json` plus Markdown.

Phase 8 frontend packet generation validates the approved screen artifact, hash-bound approval sidecar, current contract, and UI-facing slice plan. It creates no runtime tasks, no queue jobs, no worker sessions, no backend packets, and no product code; backend packets wait for a later phase. Generated packets use the Phase 7 `frontend_implementation` routing lane with verified fallback behavior. See `.pi/agent/docs/frontend_packet_generation.md`.

### 10. Phase 9 backend packet generation
After frontend implementation has passed validation, generate a preview-only BE packet for backend-applicable slices. Use `npm run harness:be-packet -- --initiative <feature-slug> --slice <slice-id> --dry-run` to inspect the generated `backend_worker` packet without writing, and `--apply` to write only `docs/initiatives/<feature-slug>/packets/<slice-id>.backend.packet.json` plus Markdown.

Phase 9 backend packet generation follows FE validation. It validates the Phase 8 frontend packet artifact, passed FE validation evidence, current contract hash, backend API/data expectations, backend allowed paths, backend TDD seeds, and backend-applicable slice plan. It creates no runtime tasks, no queue jobs, no worker sessions, no FE packet changes, and no product code. Generated packets use the Phase 7 `backend_implementation` routing lane with verified fallback behavior. See `.pi/agent/docs/backend_packet_generation.md`.

### 11. Task-packet handoff
Task-packet generation is explicitly out of scope for Phase 1 product intake, Phase 2 product-slice lifecycle, Phase 3 Stitch prompt generation, Phase 4 mock Stitch artifact generation, Phase 13 live Stitch generation, Phase 5 screen artifact approval, and Phase 6 slice contract generation. Do not generate FE/BE worker packets from `harness:product-intake`, `harness:stitch-prompt`, `harness:stitch-artifact`, `harness:live-stitch-artifact`, `harness:screen-approval`, or `harness:slice-contract`; first complete PRD synthesis, backlog slicing, product slice lifecycle planning, human prompt review, mock or explicit live artifact generation, human artifact review, hash-bound screen artifact approval, and current slice contract generation. Use `harness:fe-packet` only for Phase 8 frontend preview artifacts and `harness:be-packet` only for Phase 9 backend preview artifacts after FE validation.

Map approved slices into current harness task packets or queue jobs only after explicit scheduler/queue gates exist.
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

### 11. Phase 11 product pipeline runtime

After FE/BE packet preview surfaces exist, use the product pipeline runtime to inspect and advance a bounded initiative plan:

```bash
npm run harness:product-pipeline -- dry-run --initiative <feature-slug> --json
npm run harness:product-pipeline -- apply --initiative <feature-slug> --max-parallel 1
npm run harness:product-pipeline -- status --initiative <feature-slug>
```

The product pipeline loads `docs/initiatives/<feature-slug>/pipeline.json`, prints the slice DAG, shows HITL gates, preserves sequential phase order inside each slice, and consumes Phase 10 parallel decisions. Dry-run writes no files. Apply stops at unresolved HITL gates and performs one bounded foreground materialization step, writing only `docs/initiatives/<feature-slug>/pipeline-runs/<run-id>.json`.

Phase 11 does not introduce a daemon and does not create runtime tasks, queue jobs, worker sessions, handoffs, or product code. Intra-slice phases remain sequential. Cross-slice parallelism requires Phase 10 `parallelAllowed: true` proof for every active pair.
