# Planning Log — graphify-final-runbook

## Discovery Path
- Used `auggie_discover` first with a bounded timeout; it timed out and recommended local fallback.
- Local fallback: inspected `scripts/check-repo-static.sh`, `.pi/agent/docs/file_map.md`, `.pi/agent/docs/graphify_adapter.md`, `.pi/agent/docs/validation_architecture.md`, `README.md`, `logs/CURRENT.md`, and `rg` results for Graphify runbook/checklist/static wiring.

## Goal
- Slice 5: add a static doc/file-map gate for a final Graphify runbook, confirm the missing-runbook failure, then add the final runbook/checklist and focused validation evidence.
- Land through PR/merge and sync local main when checks pass.

## Non-Goals
- No Graphify runtime behavior changes.
- No installed Graphify requirement or default `--smoke` run.
- No changes to generated Graphify artifacts or validation report commit policy.
- No broad documentation rewrite beyond the final runbook/checklist wiring.

## Assumptions
- The final runbook should be a dedicated doc: `.pi/agent/docs/graphify_final_runbook.md`.
- The static gate should fail first because that doc and file-map references do not exist yet.
- Full focused validation means Graphify validator + repo static checks + foundation extension compile + diff check, with PR CI as final remote proof.

## Cross-Model Check
- Not used; this is a low-risk docs/static-wiring slice.

## Plan Draft A
- Add `graphify_final_runbook.md` to required static files and assert file-map/doc content in `scripts/check-repo-static.sh`.
- Run `bash scripts/check-repo-static.sh` to confirm missing-file/static failure.
- Add the runbook with a concise operator checklist covering preflight, scan, query, verification, cleanup, reporting, and non-goals.
- Update file map plus Graphify docs/operator/validation references only as needed for discoverability.

## Plan Draft B
- Avoid adding a new doc and instead append a final checklist section to `.pi/agent/docs/graphify_adapter.md`.
- Add a static check requiring that section and file-map mention.
- This is smaller but makes the adapter doc too long and less clearly operator-runbook focused.

## Unified Plan
- Choose Draft A: a dedicated final runbook/checklist gives the cleanest operator path and strongest file-map validation.
- Keep static expectations narrow: require the runbook file, file-map entry, Graphify adapter link, validation architecture link, and core checklist phrases.
- Keep validation local-first and focused.

## Files to Modify
- `scripts/check-repo-static.sh` — add RED static requirements for the final Graphify runbook and file-map wiring.
- `.pi/agent/docs/file_map.md` — add the final runbook under validation workflow and/or Graphify adapter area.
- `.pi/agent/docs/graphify_adapter.md` — link to the final runbook.
- `.pi/agent/docs/validation_architecture.md` — mention the final runbook/checklist in Graphify validation context.
- `README.md` or `.pi/agent/docs/operator_workflow.md` if needed for discoverability.
- `logs/CURRENT.md`, `logs/coding/2026-05-03_graphify-final-runbook.md`, this planning log.

## New Files
- `.pi/agent/docs/graphify_final_runbook.md`
- `logs/coding/2026-05-03_graphify-final-runbook.md`
- `reports/planning/2026-05-03_graphify-final-runbook-plan.md`

## TDD Sequence
1. Add/stub static assertions in `scripts/check-repo-static.sh` for `.pi/agent/docs/graphify_final_runbook.md`, file-map wiring, and required checklist phrases.
2. Run `bash scripts/check-repo-static.sh` and confirm it fails for the missing final runbook/file-map wiring.
3. Add `.pi/agent/docs/graphify_final_runbook.md` with the smallest complete checklist.
4. Update `.pi/agent/docs/file_map.md` and required references.
5. Run focused validation again: static checks, Graphify validator, compile, and diff check.

## Test Coverage
- Static: `scripts/check-repo-static.sh` enforces the runbook file and wiring.
- Graphify focused: `scripts/validate-graphify-discovery.sh` confirms adapter/discovery prompt/doc validation still passes.
- Compile: `scripts/check-foundation-extension-compile.sh` verifies extension TypeScript still compiles despite no runtime changes.

## Acceptance Criteria
- RED failure recorded from static check before docs/checklist implementation.
- Final Graphify runbook/checklist exists and is discoverable through file map and Graphify docs.
- Focused local validation passes.
- PR CI passes, PR merges, local main syncs to merge commit.

## Wiring Checks
| Component | Runtime entry point | Registration location | Schema/table | Verification |
|---|---|---|---|---|
| Graphify final runbook | Operator docs/static validation | `scripts/check-repo-static.sh`, `.pi/agent/docs/file_map.md`, `.pi/agent/docs/graphify_adapter.md` | n/a | `bash scripts/check-repo-static.sh` requires file and checklist phrases |

## Validation
- `bash scripts/check-repo-static.sh`
- `bash scripts/validate-graphify-discovery.sh --report /tmp/graphify-slice5-green.md --summary-json /tmp/graphify-slice5-green.json`
- `bash scripts/check-foundation-extension-compile.sh`
- `git diff --check`
- PR checks via `gh pr checks` at bounded intervals, no `--watch`.

## Risks
- Static checks may become too brittle if they assert too many exact phrases.
- A runbook can imply Graphify is mandatory; wording must keep Graphify optional and local-first.
- Validation reports generated under `reports/validation/` should not be committed unless explicitly needed.

## Pi Log Update
- Planning log: `reports/planning/2026-05-03_graphify-final-runbook-plan.md`
- Coding log: `logs/coding/2026-05-03_graphify-final-runbook.md`
