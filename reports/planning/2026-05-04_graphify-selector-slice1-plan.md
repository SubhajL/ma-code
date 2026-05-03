# Planning Log — Graphify Selector Slice 1

- Date: 2026-05-04
- Scope: Discovery-policy selector slice only.
- Status: ready
- Related coding log: `logs/coding/2026-05-04_graphify-selector-slice1.md`

## Goal
- Make `select_discovery_policy` recommend Graphify setup for broad-structure work when Graphify is available but no fresh graph is reported.

## Scope
- Modify discovery selector behavior and focused tests.
- Add minimal docs alignment for the preflight-first recommendation.

## Files to Create or Edit
- `.pi/agent/extensions/discovery-policy.ts`
- `tests/extension-units/discovery-policy.test.ts`
- `.pi/agent/docs/discovery_policy.md`
- `logs/CURRENT.md`
- `logs/coding/2026-05-04_graphify-selector-slice1.md`

## Why Each File Exists
- `discovery-policy.ts`: executable helper behavior.
- `discovery-policy.test.ts`: regression proof for selector behavior.
- `discovery_policy.md`: operator-facing policy alignment.
- logs: Pi evidence discipline.

## What Logic Belongs There
- Side-effect-free advisory selection only.
- Recommendation to run `graphify_adapter` preflight before scan when broad-structure graph evidence is useful but stale/missing.

## What Should Not Go There
- No Graphify daemon.
- No automatic scan.
- No adapter preflight-token enforcement.
- No cadence/freshness helper.

## Dependencies
- Existing `select_discovery_policy` tool.
- Existing `graphify_adapter` preflight/scan/query actions.

## Acceptance Criteria
- Broad-structure + Graphify available + not fresh selects `graphify` and mentions preflight/scan setup.
- Fresh broad-structure behavior remains Graphify.
- Exact verification remains local.
- Graphify validator and static checks pass.

## Likely Failure Modes
- Selector accidentally prefers Graphify for exact known-file verification.
- Selector wording implies automatic scan execution.
- Graphify stale/no-fresh behavior still falls back to local.

## Validation Plan
- `bash scripts/validate-graphify-discovery.sh --report /tmp/graphify-slice1-green.md --summary-json /tmp/graphify-slice1-green.json`
- `bash scripts/check-repo-static.sh`
- `git diff --check`

## Recommended Next Step
- Review and open a PR for slice 1.
