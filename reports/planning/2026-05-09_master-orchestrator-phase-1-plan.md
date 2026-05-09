# Master Orchestrator Phase 1 Plan

## Goal
- Implement a read-only deterministic classifier that maps a human goal to a known safe harness path and next dry-run/status command.

## Scope
- Add pure classifier helper, CLI wrapper, operator delegation, tests, docs, and static wiring checks.
- No durable state writes from classifier runtime.
- No queue/task mutation, implementation execution, PR creation, or merge from the classifier.

## Direct-Implementation Exemption
- Intake was not required: this is a harness-internal runtime-control improvement with explicit Phase 1 plan and acceptance criteria supplied by the user.

## Files to Modify
- `package.json`: add `harness:orchestrate` script.
- `scripts/harness-operator.ts`: add `orchestrate` delegate.
- `scripts/check-repo-static.sh`: require new wiring artifacts.
- `README.md`: document Phase 1 classify flow.
- `.pi/agent/docs/operator_workflow.md`: document operator usage.
- `logs/CURRENT.md`: point to active log pair.

## New Files
- `.pi/agent/extensions/orchestrator-classifier.ts`
- `scripts/harness-orchestrate.ts`
- `tests/extension-units/orchestrator-classifier.test.ts`
- `tests/integration/orchestrator-classifier.test.ts`
- `.pi/agent/docs/master_orchestrator.md`
- `scripts/validate-orchestrator-classifier.sh`

## First TDD Slice
- Behavior: `classifyOrchestratorGoal({ goal: "Build checkout mini flow" })` selects `product_feature` and recommends `npm run harness:product-intake ... --dry-run`.
- Public interface: `npm run harness:orchestrate -- classify --goal "Build checkout mini flow" --json`.
- Boundary fakes: temp repo/package.json/initiative files; optional git metadata passed as classifier input.
- Out of scope: executing returned command, writing reports, applying artifacts, creating PRs, merging.

## Acceptance Criteria
- `npm run harness:orchestrate -- classify --goal "Build checkout mini flow" --json` returns valid JSON.
- `npm run harness:operator -- orchestrate classify --goal "..." --json` delegates successfully.
- Classifier writes no files.
- Ambiguous requests return `selectedPath: "clarification"` and no executable/apply/run command.
- Missing required artifacts appear in `requiredArtifacts` or `blockedReasons`.
- `nextDryRunCommand` maps to an existing package script whenever present.
- No direct runtime JSON edits; no queue/task mutation; no PR creation or merge.

## Validation Plan
- Targeted unit tests and integration tests.
- `bash scripts/check-repo-static.sh`
- `git diff --check`
- `bash scripts/validate-core-workflows.sh`
