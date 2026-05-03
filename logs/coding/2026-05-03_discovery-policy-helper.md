# Coding Log — discovery-policy-helper

- Date: 2026-05-03
- Scope: minimal executable discovery-policy selector helper
- Status: in_progress
- Branch: `split/discovery-policy-helper`
- Related planning log: `reports/planning/2026-05-03_discovery-policy-helper-plan.md`

## Task Group
- Add a deterministic helper and tool for choosing the discovery path from the canonical discovery policy.

## Discovery Path
- Read `AGENTS.md`, `README.md`, `logs/CURRENT.md`, and `.pi/agent/docs/discovery_policy.md`.
- Attempted Auggie discovery first; unavailable due credit exhaustion, so used local file inspection and grep.
- Inspected extension/tool patterns in `.pi/agent/extensions/harness-routing.ts`, existing unit test patterns, and compile/unit validator scripts.

## TDD Plan
- RED: add a unit test importing the planned helper and asserting Auggie, Graphify, local read/rg/find, and Exa selections.
- GREEN: implement minimal helper and wire it into compile/unit/static/docs surfaces.
- Validate with focused test, compile, extension unit validator, static check, prompt contracts if prompt surfaces change, and `git diff --check`.

## Runtime / Validation Evidence
- pending

## Files Changed
- pending

## Wiring Verification
- pending

## Known Risks
- Keep scope to selector helper only; do not execute discovery tools automatically.

## Work Summary (2026-05-03 03:28 local) - selector helper TDD

### Goal
- Implement the minimal executable discovery-policy selector helper after proving the helper was missing with a failing test.

### Files Changed and Why
- `.pi/agent/extensions/discovery-policy.ts` — new deterministic helper and `select_discovery_policy` tool registration; selects but does not execute Auggie, Graphify, local, or Exa.
- `tests/extension-units/discovery-policy.test.ts` — unit coverage for Auggie, Graphify, local read/rg/find, Exa, and unavailable-index fallback cases.
- `scripts/check-foundation-extension-compile.sh` — includes the new extension in compile proof.
- `scripts/validate-extension-unit-tests.sh` — copies and runs the new selector unit test in isolated temp runtime.
- `scripts/check-repo-static.sh` — asserts helper/doc/test/validator/package/doc wiring.
- `.pi/agent/docs/discovery_policy.md`, `.pi/agent/docs/operator_workflow.md`, `.pi/agent/docs/validation_architecture.md`, `.pi/agent/docs/file_map.md`, `README.md` — document helper purpose and validation path.
- `package.json`, `.pi/agent/package/templates/package.template.json` — add `test:discovery-policy` package script.
- `logs/CURRENT.md`, `reports/planning/2026-05-03_discovery-policy-helper-plan.md` — active log pair for this slice.

### RED Evidence
- `npx tsx --test tests/extension-units/discovery-policy.test.ts` failed before implementation with `ERR_MODULE_NOT_FOUND` for `.pi/agent/extensions/discovery-policy.ts`, proving the selector helper was missing.
- After implementation, `bash scripts/validate-extension-unit-tests.sh` initially failed because exact-verification inputs incorrectly selected `exa` instead of `local`; fixed by making the primary `need` drive exact-verification selection before advisory `externalCurrentInfoNeeded` hints.

### GREEN Evidence
- `bash scripts/check-foundation-extension-compile.sh` -> `foundation-extension-compile-ok`.
- `bash scripts/validate-extension-unit-tests.sh` -> `Extension unit-test validation PASS`.
- `bash scripts/check-repo-static.sh` -> `prompt-contract-validation: PASS (29 prompt files checked)` and `repo-static-checks-ok`.
- `git diff --check` -> no output.

### Wiring Verification
- `.pi/settings.json` already loads `.pi/agent/extensions`, so the new `.pi/agent/extensions/discovery-policy.ts` default export is discoverable with the other extension tools.
- Compile script includes `src/discovery-policy.ts`.
- Extension unit validator copies `discovery-policy.ts` and runs `tests/extension-units/discovery-policy.test.ts`.
- Static check asserts helper, test, validator, package, and doc references.

### Behavior Changes and Risk Notes
- Adds one advisory helper/tool; it does not execute discovery tools or alter queue/task/routing behavior.
- Selection is intentionally small and deterministic; future tuning should extend tests before broadening policy semantics.

## Review (2026-05-03 03:36 local) - working-tree

### Reviewed
- Repo: `/Users/subhajlimanond/dev/ma-code-worktrees/discovery-policy-helper`
- Branch: `split/discovery-policy-helper`
- Scope: working-tree
- Commands Run: `auggie_discover` (credit-exhausted fallback), `git status --short --branch`, `git diff --name-only`, `git diff --stat`, `read .pi/agent/extensions/discovery-policy.ts`, `read tests/extension-units/discovery-policy.test.ts`, `bash scripts/check-foundation-extension-compile.sh`, `bash scripts/validate-extension-unit-tests.sh`, `bash scripts/check-repo-static.sh`, `git diff --check`

### Findings
CRITICAL
- none

HIGH
- none

MEDIUM
- none

LOW
- none

### Open Questions / Assumptions
- Assumption: the helper is intentionally advisory and should not execute Auggie, Graphify, local tools, or Exa itself.
- Assumption: extension auto-discovery through `.pi/settings.json` `agent/extensions` is sufficient runtime registration for this new tool file.

### Recommended Tests / Validation
- Already run: `bash scripts/check-foundation-extension-compile.sh`.
- Already run: `bash scripts/validate-extension-unit-tests.sh`.
- Already run: `bash scripts/check-repo-static.sh`.
- Already run: `git diff --check`.

### Rollout Notes
- New helper registers `select_discovery_policy`; it is deterministic and local-only.
- No queue/task/routing behavior changes expected.

Review Verdict: no_required_fixes
