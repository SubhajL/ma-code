# Planning Log — discovery-policy-helper

- Date: 2026-05-03
- Scope: minimal executable discovery-policy selector helper
- Status: ready
- Related coding log: `logs/coding/2026-05-03_discovery-policy-helper.md`

## Goal
- Add a small deterministic helper that applies the canonical discovery policy to choose among Auggie, Graphify, local read/rg/find, and Exa.
- Keep the helper bounded and test-first, with docs/static/validation wiring.

## Scope
- New extension helper and tool registration.
- Unit tests for selection behavior.
- Compile/unit/static/docs wiring.
- PR/merge/local-main sync.

## Files to Create or Edit
- `.pi/agent/extensions/discovery-policy.ts`
- `tests/extension-units/discovery-policy.test.ts`
- `scripts/check-foundation-extension-compile.sh`
- `scripts/validate-extension-unit-tests.sh`
- `scripts/check-repo-static.sh`
- `.pi/agent/docs/discovery_policy.md`
- `.pi/agent/docs/file_map.md`
- `.pi/agent/docs/operator_workflow.md`
- `.pi/agent/docs/validation_architecture.md`
- `README.md`
- `package.json`
- `logs/CURRENT.md`
- `logs/coding/2026-05-03_discovery-policy-helper.md`

## What Logic Belongs There
- Deterministic selection function and tiny registered tool surface.
- Selection reasons and required verification reminders.
- Tests that prove the four canonical choices and fallback behavior.

## What Should Not Go There
- No automatic tool execution.
- No queue/task/routing behavior changes.
- No live-provider calls.

## TDD Sequence
1. Add failing selector test for Auggie/Graphify/local/Exa choices.
2. Run the test and confirm it fails because the helper is missing.
3. Implement minimal selector and registered tool.
4. Add compile/unit/static/docs/package wiring.
5. Run focused validation and g-check before PR.

## Acceptance Criteria
- Failing selector test is captured before implementation.
- Helper encodes Auggie, Graphify, local read/rg/find, and Exa selection.
- Validation scripts and docs make the helper discoverable.
- Focused validation and g-check pass.
- PR merges to main and local main is synced.

## Risks
- Overbuilding a policy engine; mitigate by using one small deterministic function and one tool.
- Selection conditions too vague; mitigate with explicit bounded input fields and rationale in output.

## Slice 2 Plan — Graphify validator selector coverage
- Goal: keep the canonical Graphify validator responsible for Graphify adapter proof plus the Graphify fallback branch of the discovery-policy selector helper.
- Non-goals: no runtime selector behavior changes, no live Graphify smoke by default, no prompt wording changes beyond docs/static validator references.
- TDD sequence:
  1. Add a failing `scripts/validate-graphify-discovery.sh` check that runs `tests/extension-units/discovery-policy.test.ts` inside the isolated Graphify runtime.
  2. Confirm failure because the Graphify validator does not yet copy the selector extension/test into its temp runtime.
  3. Copy/compile `discovery-policy.ts`, copy/run `discovery-policy.test.ts`, and keep the installed-CLI smoke optional.
  4. Add static/doc wiring checks proving the selector test remains in the Graphify validator path.
  5. Validate with the Graphify validator, repo static checks, compile, and diff check before PR.
- Acceptance: `scripts/validate-graphify-discovery.sh` fails before wiring, passes after wiring, docs/static checks describe and enforce the selector coverage, and the change lands through normal PR/merge flow.
