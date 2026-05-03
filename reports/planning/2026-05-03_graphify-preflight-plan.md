# Plan — Slice 4 Graphify Preflight / Dry-Run

## Discovery Path
- Used `auggie_discover` first with a bounded timeout; it timed out and recommended local fallback.
- Local fallback: inspected `.pi/agent/extensions/graphify-adapter.ts`, `tests/extension-units/graphify-adapter.test.ts`, `scripts/validate-graphify-discovery.sh`, Graphify docs, current logs, and `rg` results for preflight/dry-run/action handling.

## Goal
- Add minimal Graphify adapter preflight/dry-run support with tests-first proof.
- Preflight should validate scan inputs and report what would happen without copying source, creating managed output, or invoking Graphify.
- Land via normal branch/PR/merge flow and sync local main if validation and repo safety permit.

## Non-Goals
- No Graphify CLI behavior redesign.
- No installed-Graphify requirement in default validation.
- No changes to query output beyond existing Slice 3 behavior.
- No generated Graphify artifacts committed.

## Assumptions
- The smallest public surface is a new `action: "preflight"` on `graphify_adapter`.
- "Dry-run" is represented by the preflight action rather than adding a separate boolean mode to `scan`.
- Preflight may detect whether Graphify is installed but must not require it or execute it.

## Cross-Model Check
- Not used; this is a low-risk, localized adapter/test/docs slice.

## Plan Draft A
- Add a new unit test that calls `graphify_adapter` with `action: "preflight"` on a small repo and expects a `details.status` such as `preflight_ok`, managed output path, file count, command preview, and no artifact directory creation.
- Run the Graphify validator to confirm failure because the action is not implemented/registered.
- Add `preflight` to the action schema/type and factor shared scan validation into a preflight path.
- Document the new action and run focused Graphify validation plus compile/static checks.

## Plan Draft B
- Add `dryRun: true` to the existing `scan` action instead of adding an action.
- The scan path would short-circuit before binary detection/execution and return a dry-run summary.
- This minimizes enum growth but mixes execution and non-execution behavior under one action.

## Unified Plan
- Choose Draft A: an explicit `preflight` action is clearer for operators and gives a direct missing-action RED failure.
- Keep implementation small by reusing the existing source/output/forbidden-args/file-count validation logic.
- Return structured preflight details: source path, output path, file count, approval status, forbidden args if blocked, install detection, command preview, and `wouldRun: false`.

## Files to Modify
- `.pi/agent/extensions/graphify-adapter.ts` — add `preflight` action and shared validation path.
- `tests/extension-units/graphify-adapter.test.ts` — add failing/passing preflight unit coverage.
- `.pi/agent/docs/graphify_adapter.md` — document preflight/dry-run semantics.
- `logs/CURRENT.md` — point to this slice's logs.
- `logs/coding/2026-05-03_graphify-preflight.md` — record TDD evidence and review.

## New Files
- `reports/planning/2026-05-03_graphify-preflight-plan.md`
- `logs/coding/2026-05-03_graphify-preflight.md`

## TDD Sequence
1. Add the smallest unit test for `action: "preflight"` on a small source tree.
2. Run `bash scripts/validate-graphify-discovery.sh --report /tmp/graphify-slice4-red.md --summary-json /tmp/graphify-slice4-red.json` and confirm failure is missing/incorrect preflight action behavior.
3. Implement the smallest adapter change that makes preflight return the expected dry-run result without side effects.
4. Update docs minimally.
5. Rerun `bash scripts/validate-graphify-discovery.sh`, compile, static checks, and `git diff --check`.

## Test Coverage
- Unit: preflight returns structured dry-run details and does not create managed output artifacts.
- Existing Graphify unit/integration tests continue to cover status/query/scan behavior.
- Canonical Graphify validator proves the adapter in isolated runtime without requiring installed Graphify by default.

## Acceptance Criteria
- Failing test for preflight/dry-run is added before implementation.
- Missing action failure is recorded in coding log.
- Minimal preflight implementation passes focused validation.
- PR is merged and local main is synced if CI passes and repo safety permits.

## Wiring Checks
| Component | Runtime entry point | Registration location | Schema/table | Verification |
|---|---|---|---|---|
| Graphify preflight action | `graphify_adapter({ action: "preflight" })` | `.pi/agent/extensions/graphify-adapter.ts` `pi.registerTool` | `GraphifyAdapterSchema.action` enum/type | Unit test invokes registered tool; validator copies/runs adapter tests |

## Validation
- `bash scripts/validate-graphify-discovery.sh --report /tmp/graphify-slice4-green.md --summary-json /tmp/graphify-slice4-green.json`
- `bash scripts/check-foundation-extension-compile.sh`
- `bash scripts/check-repo-static.sh`
- `git diff --check`
- PR CI checks before merge.

## Risks
- Preflight could accidentally create managed output or copy corpus if it reuses scan code too aggressively.
- Too much dry-run detail could imply execution guarantees; wording must keep it as preflight evidence only.
- Local validation report generation should not be committed unless explicitly part of the slice.

## Pi Log Update
- Planning log: `reports/planning/2026-05-03_graphify-preflight-plan.md`
- Coding log: `logs/coding/2026-05-03_graphify-preflight.md`
