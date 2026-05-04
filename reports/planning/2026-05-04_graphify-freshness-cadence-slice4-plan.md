# Planning Log — Graphify Freshness/Cadence Slice 4

## Goal
Add a bounded Graphify adapter helper action that tells operators whether an existing managed Graphify graph is fresh enough to use and what to do next for the current cadence phase.

## Scope
- Add `action: "freshness"` to `graphify_adapter`.
- Accept `taskId`, optional `outputPath`, and optional `cadencePhase`.
- Report metadata presence, graph presence, metadata/current head commits, dirty worktree state, freshness status, and recommended next action.
- Add focused unit/integration tests for missing graph, dirty worktree, and final validation guidance.
- Update docs/logs and run Graphify validator plus compile/static/diff checks.

## Non-goals
- No scan/query behavior change.
- No persistent freshness state.
- No daemon/watch behavior or automatic rescans.
- No installed Graphify requirement.

## TDD Plan
1. RED: missing graph freshness test fails because the action is not implemented.
2. GREEN: add minimal schema/action/result for missing graph.
3. RED/GREEN: add dirty worktree test and git status detection.
4. RED/GREEN: add fresh final-validation test with query/direct-verify recommendation.
5. Refactor bounded helper logic; update docs/validator wording.
6. Run focused validation, g-check-style review, PR gate, merge, and sync root main.
