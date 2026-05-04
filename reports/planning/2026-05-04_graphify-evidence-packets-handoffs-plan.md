# Plan: Graphify Evidence Fields for Task Packets and Handoffs

## Discovery Path
- Used `g-planning` and read repo rules/log convention: `AGENTS.md`, `README.md`, `logs/CURRENT.md`, and Pi log convention.
- Confirmed root repo was clean/synced `main` before mutation.
- Created active task `task-1777884902324` before mutation.
- Created isolated worktree/branch: `/Users/subhajlimanond/dev/ma-code-worktrees/task-1777884902324-graphify-evidence-packets-handoffs` / `split/task-1777884902324-graphify-evidence-packets-handoffs`.
- Auggie-first discovery attempted: timed out; used local fallback with `rg`, `read`, and targeted inspection.
- Inspected relevant files:
  - `.pi/agent/extensions/task-packets.ts`
  - `.pi/agent/extensions/handoffs.ts`
  - `.pi/agent/state/schemas/task-packet.schema.json`
  - `.pi/agent/state/schemas/handoff.schema.json`
  - `tests/extension-units/orchestration-helpers.test.ts`
  - `scripts/validate-extension-unit-tests.sh`
  - `scripts/validate-core-workflows.sh`
  - `scripts/check-repo-static.sh`
  - `.pi/agent/docs/team_orchestration_architecture.md`
  - `README.md`
- Second-model planning used; it recommended a concrete optional `graphifyEvidence` field, schema updates, preservation through handoffs, rendering, docs, and validation.

## Goal
- Add optional structured Graphify evidence/proof fields to deterministic task packets and structured handoffs.
- Ensure workers, quality, reviewers, and validators can carry explicit Graphify proof expectations/results without free-form guessing.
- Preserve fields from generated task packet through handoff preserved packet and details where supplied.

## Non-Goals
- Do not make Graphify globally mandatory.
- Do not run Graphify from packet/handoff generation.
- Do not add Graphify `--watch`, daemon, background, or hidden queue behavior.
- Do not directly edit protected runtime JSON.
- Do not redesign packet/handoff architecture.

## Assumptions
- One optional structured field named `graphifyEvidence` is sufficient for this slice.
- Existing `graphifyValidation` runtime proof shape should inform the field names, but packet/handoff generation should not import runtime validation policy to avoid coupling.
- Handoff details also need explicit Graphify evidence so completed work can pass proof to quality/validator lanes, not only preserve packet expectations.
- Existing schemas allow optional fields by default because they do not set `additionalProperties: false`; still update schemas for discoverability/validation clarity.

## Cross-Model Check
- Used `second_model_plan`.
- Adopted the recommendation to define a concrete optional `graphifyEvidence` object, update both task-packet and handoff schemas, add RED tests for dropped fields, render dedicated markdown sections, update docs/static checks, and validate data flow.

## Plan Draft A
- Add a structured `graphifyEvidence` object directly to `TaskPacket` and `TaskPacketInput`.
- Preserve `graphifyEvidence` in `PreservedPacketSummary` and add `graphifyEvidence` to `HandoffDetails` / `GenerateHandoffInput`.
- Render dedicated `## Graphify Evidence` sections in task packets and all relevant handoff forms.
- Update schemas, docs, static checks, and orchestration helper tests.

## Plan Draft B
- Avoid a new structured type and rely on existing string arrays: `evidenceExpectations`, `expectedProof`, and handoff `evidence`.
- Add only policy/doc defaults that mention Graphify evidence.
- Smaller surface, but weaker machine-readable preservation and less useful for future validators.

## Unified Plan
- Use Draft A with a bounded field set.
- Define `GraphifyEvidence` with optional nullable fields:
  - `graphifyBackedClaim`
  - `claimScope`
  - `policy`
  - `required`
  - `latestRelevantGraphQueried`
  - `freshnessOrCadenceChecked`
  - `importantClaimsSourceVerified`
  - `graphifyValidationState`
  - `graphifyOrchestrationAction`
  - `graphifyAdapterAction`
  - `graphifyArtifactPath`
  - `sourceVerificationNotes`
- Keep the field optional and non-blocking in packet/handoff generation.
- TDD through public generator APIs in `tests/extension-units/orchestration-helpers.test.ts`.
- Update schema/docs/static/validators only as needed.
- Run targeted, isolated, and static validation before PR.
- g-check review, PR, gate, merge, sync root `main`.

## Files to Modify
- `.pi/agent/extensions/task-packets.ts`
- `.pi/agent/extensions/handoffs.ts`
- `.pi/agent/state/schemas/task-packet.schema.json`
- `.pi/agent/state/schemas/handoff.schema.json`
- `tests/extension-units/orchestration-helpers.test.ts`
- `scripts/check-repo-static.sh`
- `.pi/agent/docs/team_orchestration_architecture.md`
- `README.md`
- `logs/CURRENT.md`
- `logs/coding/2026-05-04_graphify-evidence-packets-handoffs.md`

## New Files
- `reports/planning/2026-05-04_graphify-evidence-packets-handoffs-plan.md`
- `logs/coding/2026-05-04_graphify-evidence-packets-handoffs.md`

## TDD Sequence
1. Add the smallest public behavior test in `tests/extension-units/orchestration-helpers.test.ts` that passes `graphifyEvidence` into `generateTaskPacket` and asserts packet/details/rendering preserve it.
2. Run `npx --yes tsx --test tests/extension-units/orchestration-helpers.test.ts` and confirm RED because the field is currently absent/dropped.
3. Implement minimal task-packet type/schema/generation/rendering changes.
4. Run the targeted test and confirm the packet half passes; add/verify handoff preservation assertions fail if needed.
5. Implement minimal handoff type/schema/preserve/details/rendering changes.
6. Rerun targeted tests to GREEN.
7. Refactor only while GREEN if duplication in rendering is high.
8. Run fast gates and flake check.

## Test Coverage
- Unit coverage:
  - Task packet accepts optional Graphify evidence, validates shape, and renders a dedicated section.
  - Handoff preserves packet-level Graphify evidence and carries detail-level Graphify evidence.
  - Existing flows without Graphify evidence remain valid.
- Static coverage:
  - Static checker asserts field presence in packet extension, handoff extension, schemas, docs, README.
- Validator coverage:
  - Existing extension-unit validator includes orchestration helper tests.
  - Core workflow validator compiles task-packets and handoffs with updated types.

## Acceptance Criteria
- `generate_task_packet` accepts optional `graphifyEvidence` and includes it in generated packet/details/rendered packet.
- `generate_handoff` preserves packet `graphifyEvidence` and accepts optional handoff detail `graphifyEvidence`.
- Schemas document/allow the new Graphify evidence fields.
- Docs/README make the fields discoverable without implying mandatory Graphify.
- RED/GREEN evidence is recorded.
- Validation passes:
  - `npx --yes tsx --test tests/extension-units/orchestration-helpers.test.ts`
  - `bash scripts/check-foundation-extension-compile.sh`
  - `bash scripts/validate-extension-unit-tests.sh ...`
  - `bash scripts/validate-core-workflows.sh ...`
  - `bash scripts/check-repo-static.sh`
  - `git diff --check`
- PR merged to `main`; local root `main` synced.

## Wiring Checks
| Component | Runtime entry point | Registration/schema | Verification |
| --- | --- | --- | --- |
| Task packet Graphify evidence | `.pi/agent/extensions/task-packets.ts` / `generate_task_packet` | `GenerateTaskPacketSchema`, `TaskPacketInput`, `TaskPacket`, `task-packet.schema.json` | Unit test observes field in `details.packet` and rendered output; compile/static checks assert wiring. |
| Handoff Graphify evidence | `.pi/agent/extensions/handoffs.ts` / `generate_handoff` | `HandoffInputSchema`, `GenerateHandoffInput`, `StructuredHandoff`, `handoff.schema.json` | Unit test observes preserved packet field, handoff details field, and rendered output. |
| Validator/static discoverability | `scripts/check-repo-static.sh` | static assertions | Static check fails if code/schema/docs omit field. |

## Validation
- Targeted RED/GREEN:
  - `npx --yes tsx --test tests/extension-units/orchestration-helpers.test.ts`
- Fast gates:
  - `bash scripts/check-foundation-extension-compile.sh`
  - `bash scripts/validate-extension-unit-tests.sh --report /tmp/graphify-evidence-packets-handoffs-ext.md --summary-json /tmp/graphify-evidence-packets-handoffs-ext.json`
  - `bash scripts/validate-core-workflows.sh --report /tmp/graphify-evidence-packets-handoffs-core.md --summary-json /tmp/graphify-evidence-packets-handoffs-core.json`
  - `bash scripts/check-repo-static.sh`
  - `git diff --check`
- Flake check:
  - three consecutive targeted orchestration helper test runs.
- PR gate:
  - `node --import tsx scripts/harness-pr-gate.ts --pr <PR> --once` after CI starts; rerun bounded if pending.

## Risks
- Field shape could become too large or too close to runtime validation internals; mitigate by keeping fields optional, simple, and string/boolean/array based.
- Handoff rendering could add clutter; mitigate with a compact dedicated section rendered only when evidence exists.
- Static/schema drift; mitigate with checks in `scripts/check-repo-static.sh`.
- Existing queue semantics docs say queue jobs do not carry packet override lists; avoid changing queue job behavior in this slice.

## Pi Log Update
- Planning log: `reports/planning/2026-05-04_graphify-evidence-packets-handoffs-plan.md`
- Coding log: `logs/coding/2026-05-04_graphify-evidence-packets-handoffs.md`
