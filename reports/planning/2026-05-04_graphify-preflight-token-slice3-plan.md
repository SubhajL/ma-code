# Planning Log — Graphify Preflight Token Slice 3

- Date: 2026-05-04
- Scope: Enforce preflight-before-scan without persistent state.
- Status: ready
- Related coding log: `logs/coding/2026-05-04_graphify-preflight-token-slice3.md`

## Goal
- Require Graphify scans to include a deterministic `preflightToken` returned from a matching preflight call.

## Scope
- Add stateless token generation to Graphify adapter.
- Return token from preflight.
- Require matching token for scan after request revalidation and before artifacts/Graphify execution.
- Update tests, optional smoke path, and docs.

## Files to Create or Edit
- `.pi/agent/extensions/graphify-adapter.ts`
- `tests/extension-units/graphify-adapter.test.ts`
- `tests/integration/graphify-adapter.test.ts`
- `scripts/validate-graphify-discovery.sh`
- `.pi/agent/docs/graphify_adapter.md`
- `.pi/agent/docs/graphify_final_runbook.md`
- `logs/CURRENT.md`
- `logs/coding/2026-05-04_graphify-preflight-token-slice3.md`
- `reports/planning/2026-05-04_graphify-preflight-token-slice3-plan.md`

## Why Each File Exists
- Adapter: runtime behavior and token validation.
- Tests: RED/GREEN proof for missing, wrong, and matching token flows.
- Validator script: optional installed-CLI smoke stays compatible with token requirement.
- Docs/logs: operator contract and evidence trail.

## What Logic Belongs There
- Token basis: normalized source path, managed output path, sanitized task id, purpose, file count, max threshold, approved-large-corpus flag, and safe extra args.
- Missing token and mismatched token produce explicit blocked statuses.

## What Should Not Go There
- No persistent token state.
- No cadence/freshness helper.
- No daemon, watch mode, or automatic rescan.

## Dependencies
- Existing Graphify purpose enforcement from slice 2.
- Existing managed output and protected path validation.

## Acceptance Criteria
- Preflight returns deterministic token and creates no artifacts.
- Scan without token blocks.
- Scan with wrong token blocks.
- Scan with matching preflight token succeeds.
- Existing Graphify safety gates remain intact.

## Likely Failure Modes
- Existing scan tests fail until updated to preflight first.
- Token includes unstable values and changes between identical preflight calls.
- Token check runs too early and hides source/output/approval safety failures.

## Validation Plan
- `bash scripts/validate-graphify-discovery.sh --report /tmp/graphify-token-green.md --summary-json /tmp/graphify-token-green.json`
- `bash scripts/check-foundation-extension-compile.sh`
- `bash scripts/check-repo-static.sh`
- `git diff --check`

## Recommended Next Step
- Review and open PR for slice 3.
