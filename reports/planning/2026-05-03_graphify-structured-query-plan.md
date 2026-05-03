# Planning Log — graphify-structured-query

- Date: 2026-05-03
- Scope: Slice 3 structured Graphify query output
- Status: ready
- Related coding log: `logs/coding/2026-05-03_graphify-structured-query.md`

## Goal
- Add minimal structured query summary fields to `graphify_adapter` query results.
- Preserve existing text output and existing Graphify scan/query safety behavior.

## Non-Goals
- No Graphify CLI behavior changes.
- No required installed-CLI smoke by default.
- No broad graph analysis engine; only a small stable summary object.

## Discovery Path
- Auggie attempted first and timed out; used local file inspection fallback.
- Inspected `.pi/agent/extensions/graphify-adapter.ts`, `tests/extension-units/graphify-adapter.test.ts`, `tests/integration/graphify-adapter.test.ts`, `logs/CURRENT.md`, and repo task state.

## Plan Draft A
- Add `querySummary` to query-result `details` containing query text, graph path, output path, edge counts, node count, confidence counts, freshness status, and direct-verification reminder.
- Add unit test in existing managed graph query test.
- Validate with Graphify validator and compile/static checks.

## Plan Draft B
- Add top-level fields only (`query`, `edgeCount`, `nodeCount`) without nesting.
- Smaller output but less coherent and more likely to clutter `details`.

## Unified Plan
- Use Draft A with one nested `querySummary` object for a stable structured surface while retaining current top-level compatibility fields.
- Keep implementation local to `queryResult` and helper functions.

## TDD Sequence
1. Add failing unit assertions for `result.details.querySummary` fields.
2. Run the Graphify unit test/validator and confirm failure is missing `querySummary`.
3. Implement the smallest helper to build structured summary fields from parsed graph, metadata, and resolved paths.
4. Rerun Graphify unit/integration validation.
5. Run compile/static/diff checks and review before PR.

## Files to Modify
- `.pi/agent/extensions/graphify-adapter.ts`
- `tests/extension-units/graphify-adapter.test.ts`
- `.pi/agent/docs/graphify_adapter.md` if documenting the public query details output is needed
- `logs/CURRENT.md`
- `logs/coding/2026-05-03_graphify-structured-query.md`
- `reports/planning/2026-05-03_graphify-structured-query-plan.md`

## New Files
- `reports/planning/2026-05-03_graphify-structured-query-plan.md`
- `logs/coding/2026-05-03_graphify-structured-query.md`

## Acceptance Criteria
- Unit test fails before implementation for missing structured query summary.
- Query results expose minimal structured summary fields in `details.querySummary`.
- Graphify unit and integration validator paths pass.
- PR merges to main and local main is synced.

## Wiring Checks
| Component | Entry point | Registration | Verification |
|---|---|---|---|
| Graphify query details | `graphify_adapter` action `query` | `.pi/agent/extensions/graphify-adapter.ts` default export already registers tool | unit test exercises `tool.execute(... action: query ...)` and validator compiles/runs adapter |

## Validation Plan
- `bash scripts/validate-graphify-discovery.sh --report /tmp/graphify-slice3-green.md --summary-json /tmp/graphify-slice3-green.json`
- `bash scripts/check-foundation-extension-compile.sh`
- `bash scripts/check-repo-static.sh`
- `git diff --check`

## Risks
- Risk: over-expanding query output. Mitigation: one nested minimal summary object.
- Risk: breaking existing details consumers. Mitigation: retain current top-level details fields.
