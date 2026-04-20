# Planning Log — harness-009-queue-semantics

- Date: 2026-04-20
- Scope: Finalize bounded HARNESS-009 queue semantics with explicit validator evidence and a decision-complete runtime shape that cleanly unblocks HARNESS-032.
- Status: ready
- Related coding log: `logs/coding/2026-04-20_harness-009-queue-semantics.md`

## Discovery Path
- Auggie-first attempt: `auggie_discover`
  - result: timeout
  - fallback: local discovery with `read`, `rg`, and targeted file inspection
- Inspected:
  - `AGENTS.md`
  - `README.md`
  - `pi_harness_implementation_backlog_REPO_LOCAL.md` (HARNESS-009 and HARNESS-032 sections)
  - `.pi/agent/docs/queue_semantics.md`
  - `.pi/agent/state/schemas/queue.schema.json`
  - `.pi/agent/state/runtime/queue.json`
  - `.pi/agent/docs/operator_workflow.md`
  - `scripts/check-repo-static.sh`
  - existing validator/report patterns under `scripts/validate-*.sh`
- Cross-model planning fallback:
  - `second_model_plan` unavailable because Anthropic credits are too low
  - main/current model plan kept

## Goal
- Make queue semantics deterministic enough that HARNESS-032 can build on a stable queue contract instead of re-deciding queue shape and lifecycle rules later.

## Non-Goals
- no live queue runner
- no queue daemon or scheduler implementation
- no UI/pause-resume controls
- no parallel queue execution
- no broad recovery runtime beyond queue semantics needed for HARNESS-009

## Assumptions
- HARNESS-009 should close the semantic contract, not the execution runtime
- a versioned top-level queue object is the better runtime shape because HARNESS-032/034/035 will need queue-level metadata such as pause state and active job identity
- editing `.pi/agent/state/runtime/queue.json` is an intentional bounded maintenance update required by this task, not normal runtime usage
- one dedicated validator is the correct regression surface for this slice

## Cross-Model Check
- attempted `second_model_plan`
- explicit fallback to main/current model because Anthropic credits were unavailable

## Plan Draft A
- Keep queue state as a top-level array
- Tighten docs and schema around the existing array shape
- Add a dedicated queue validator that proves lifecycle semantics by validating example objects and doc/schema alignment
- Pros:
  - smallest surface change
  - no runtime migration needed
- Cons:
  - HARNESS-032 would still need to redesign queue-wide metadata storage later
  - pause/resume, active job, and executor state would remain awkward or require a breaking change later

## Plan Draft B
- Change queue state to a versioned top-level object:
  - `version`
  - `paused`
  - `activeJobId`
  - `jobs`
- Update docs, schema, runtime placeholder, file map, operator workflow, README, and static checks accordingly
- Add a dedicated validator to prove:
  - schema/runtime alignment
  - legal status meanings stay explicit
  - blocked vs failed distinction is preserved
  - deterministic job selection guidance is documented
  - queue runtime placeholder matches the finalized shape
- Pros:
  - cleanly unblocks HARNESS-032/034/035/036
  - queue-level controls become first-class without later schema churn
- Cons:
  - slightly larger surface now
  - requires intentional migration of the runtime placeholder

## Unified Plan
- Use Draft B
- Rationale:
  - HARNESS-009 should remove ambiguity for HARNESS-032, not preserve it
  - queue semantics need queue-level metadata, so a versioned object is the more stable contract
  - keep the implementation bounded to schema/docs/runtime placeholder/validator/static-check wiring only
- Implementation outline:
  1. Create a dedicated queue validator script and use it first as RED
  2. Update queue schema from top-level array to a versioned object with bounded job fields
  3. Update runtime placeholder `queue.json` to the finalized empty-state object
  4. Update queue semantics docs and any affected operator/file-map/README references
  5. Wire the new validator into static checks and CI
  6. Run cheap/local gates, then skeptical review, then PR/merge flow

## Files to Modify
- `.pi/agent/state/schemas/queue.schema.json`
- `.pi/agent/state/runtime/queue.json`
- `.pi/agent/docs/queue_semantics.md`
- `.pi/agent/docs/operator_workflow.md`
- `.pi/agent/docs/file_map.md`
- `.pi/agent/docs/harness_phase_capability_map.md`
- `scripts/check-repo-static.sh`
- `.github/workflows/ci.yml`
- `README.md`
- `logs/CURRENT.md`
- `logs/coding/2026-04-20_harness-009-queue-semantics.md`
- `reports/planning/2026-04-20_harness-009-queue-semantics-plan.md`

## New Files
- `scripts/validate-queue-semantics.sh`
- `reports/validation/2026-04-20_queue-semantics-validation-script.md`
- `reports/validation/2026-04-20_queue-semantics-validation-script.json`

## TDD Sequence
- 1. Add `scripts/validate-queue-semantics.sh` with expectations for the desired versioned queue shape and run it before implementation
- 2. Confirm RED because current schema/runtime still use the old top-level array shape and missing validator surface
- 3. Implement the smallest schema/runtime placeholder updates to satisfy the new validator
- 4. Update docs to exactly match the finalized shape and semantics
- 5. Wire the validator into static checks and CI
- 6. Re-run the queue validator until GREEN
- 7. Run relevant cheap gates (`check-repo-static`, shell syntax, JSON readback)
- 8. Perform skeptical self-review and append `g-check`-style artifact

## Test Coverage
- queue runtime file matches the finalized schema shape
- required top-level queue fields are present
- queue job status enum preserves `blocked` vs `failed`
- queue docs no longer describe the obsolete top-level array shape
- validator report artifacts are generated
- static checks require the new validator script

## Acceptance Criteria
- queue runtime shape is decision-complete and versioned
- queue schema, runtime placeholder, and docs agree on the same shape
- blocked vs failed semantics remain explicit and distinct
- a dedicated queue validator exists and passes locally
- static checks and CI know about the new validator
- HARNESS-032 can rely on a stable queue contract without first redesigning queue metadata storage

## Wiring Checks
| Component | Entry Point | Registration Location | How to Verify |
|---|---|---|---|
| queue semantics validator | `./scripts/validate-queue-semantics.sh` | `scripts/check-repo-static.sh` and `.github/workflows/ci.yml` | validator script runs successfully and is referenced by static/CI checks |
| queue state contract | `.pi/agent/state/schemas/queue.schema.json` | runtime placeholder `.pi/agent/state/runtime/queue.json` | JSON readback + validator confirms schema/runtime alignment |
| operator discoverability | `.pi/agent/docs/queue_semantics.md` | linked from file map / README / operator docs | readback shows versioned queue object and updated operator guidance |

## Validation
- primary validator:
  - `./scripts/validate-queue-semantics.sh`
- supporting gates:
  - `./scripts/check-repo-static.sh`
  - `bash -n scripts/*.sh`
  - JSON readback for queue schema/runtime/report outputs
- save artifacts under:
  - `reports/validation/2026-04-20_queue-semantics-validation-script.md`
  - `reports/validation/2026-04-20_queue-semantics-validation-script.json`
- flake policy:
  - target 3 consecutive passes for the changed queue-validator scope unless cost/benefit indicates a narrower choice; if reduced, record why

## Risks
- queue-shape migration now could require minor later extension once HARNESS-032 introduces richer timestamps/notes
- overreaching into queue-runner logic would widen scope and violate HARNESS-009 bounds
- the runtime placeholder is under a protected path, so edits must remain minimal and intentional

## Pi Log Update
- planning log: `reports/planning/2026-04-20_harness-009-queue-semantics-plan.md`
- coding log: `logs/coding/2026-04-20_harness-009-queue-semantics.md`
