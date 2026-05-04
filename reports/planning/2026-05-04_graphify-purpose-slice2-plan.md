# Planning Log — Graphify Purpose Slice 2

- Date: 2026-05-04
- Scope: Enforce broad-purpose intent for Graphify preflight and scan.
- Status: ready
- Related coding log: `logs/coding/2026-05-04_graphify-purpose-slice2.md`

## Goal
- Require Graphify `preflight` and `scan` calls to declare a broad discovery purpose before any scan-request validation proceeds.

## Scope
- Add `purpose` parameter to Graphify adapter params.
- Enforce allowed broad purposes for preflight and scan only.
- Add focused tests for missing, narrow, and valid purpose paths.

## Files to Create or Edit
- `.pi/agent/extensions/graphify-adapter.ts`
- `tests/extension-units/graphify-adapter.test.ts`
- `tests/integration/graphify-adapter.test.ts`
- `.pi/agent/docs/graphify_adapter.md`
- `logs/CURRENT.md`
- `logs/coding/2026-05-04_graphify-purpose-slice2.md`
- `reports/planning/2026-05-04_graphify-purpose-slice2-plan.md`

## Why Each File Exists
- `graphify-adapter.ts`: runtime enforcement point for adapter calls.
- Unit tests: behavior proof for missing/narrow/valid purposes.
- Integration test: preserves existing fake-binary scan proof under the new contract.
- Logs: Pi evidence discipline.

## What Logic Belongs There
- Allowed broad purposes: `architecture_review`, `dependency_exploration`, `drift_analysis`, `large_subsystem_mapping`, `curated_research`.
- Missing or invalid purpose should block with clear status before scan/preflight proceeds.

## What Should Not Go There
- No preflight token enforcement.
- No cadence/freshness helper.
- No daemon/watch/auto-rescan.
- No query purpose requirement.

## Dependencies
- Existing `graphify_adapter` safety validation and Graphify validator script.

## Acceptance Criteria
- Preflight and scan without purpose block.
- Preflight and scan with `purpose: "exact_verification"` block.
- Existing safety behavior still works with valid broad purposes.
- Graphify validator/static/compile/diff checks pass.

## Likely Failure Modes
- Existing scan/preflight tests fail because they need valid purpose values.
- Schema rejects unknown purpose before runtime can return a clear adapter error.
- Purpose validation accidentally affects query/status.

## Validation Plan
- `bash scripts/validate-graphify-discovery.sh --report /tmp/graphify-purpose-green.md --summary-json /tmp/graphify-purpose-green.json`
- `bash scripts/check-repo-static.sh`
- `bash scripts/check-foundation-extension-compile.sh`
- `git diff --check`

## Recommended Next Step
- Review and open PR for slice 2.
