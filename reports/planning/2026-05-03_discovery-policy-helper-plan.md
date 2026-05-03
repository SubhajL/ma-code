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
