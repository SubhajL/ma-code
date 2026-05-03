# Coding Log — pr-gate-helper

## Scope
- Add a harness helper for CI/security gate checks that polls GitHub PR checks without `--watch`.
- Default behavior: check once every 3 minutes until checks reach terminal pass/fail or bounded max attempts.

## Discovery
- Loaded g-coding workflow and repo log convention.
- Auggie discovery attempted first with bounded timeout; it timed out and recommended local fallback.
- Local fallback inspected package scripts, operator helper scripts, integration tests, core-workflows validator, README, operator docs, and current PR check behavior.

## Plan
- Planning log: `reports/planning/2026-05-03_pr-gate-helper-plan.md`
- First tracer behavior: fake runner proves the helper invokes `gh pr checks <pr> --json name,state,...` without `--watch`, sleeps 180 seconds between pending checks, and stops when all checks pass.

## Work Summary (2026-05-03 16:08 local) - PR gate helper TDD implementation

### Goal
- Wire a harness helper for GitHub CI/security gate checks that checks once every 3 minutes by default and never uses `gh pr checks --watch`.

### Files Changed
- `scripts/harness-pr-gate.ts` — new importable/CLI helper that polls `gh pr checks` without `--watch`, defaults to 180-second intervals, stops on pass/fail/timeout, and summarizes reviews/comments.
- `tests/integration/pr-gate.test.ts` — fake-`gh` integration coverage for no-watch polling, 180-second sleep, terminal pass/fail behavior, benign Dependency Review bot comments, non-bot comments, and changes-requested reviews.
- `package.json` — added `harness:pr-gate`, `harness:pr-gate:json`, and `test:pr-gate` scripts.
- `scripts/validate-core-workflows.sh` — compiles/copies/tests the new helper in the isolated core workflow validator and adds wiring checks.
- `scripts/check-repo-static.sh` — adds cheap static wiring assertions for the helper/package/docs/file-map.
- `README.md`, `.pi/agent/docs/operator_workflow.md`, `.pi/agent/docs/operator_quickstart.md`, `.pi/agent/docs/validation_architecture.md`, `.pi/agent/docs/file_map.md` — document the no-`--watch`, 180-second PR gate helper path.
- `logs/CURRENT.md`, `logs/coding/2026-05-03_pr-gate-helper.md`, `reports/planning/2026-05-03_pr-gate-helper-plan.md` — active Pi log pair for this slice.

### RED Evidence
- Initial direct run without repo-local deps: `node --import tsx --test tests/integration/pr-gate.test.ts` failed with `ERR_MODULE_NOT_FOUND` for package `tsx`; reran with `npx --yes tsx` to reach the intended behavior-level RED.
- RED command: `npx --yes tsx --test tests/integration/pr-gate.test.ts`
- RED result: failed with `ERR_MODULE_NOT_FOUND` for `scripts/harness-pr-gate.ts`, proving the new PR gate helper surface was missing.

### GREEN Evidence
- `npx --yes tsx --test tests/integration/pr-gate.test.ts` -> 2 tests passed.
- Flake confidence for changed test scope: two additional consecutive passes of `npx --yes tsx --test tests/integration/pr-gate.test.ts`.
- Live one-shot proof against merged PR #63: `npx --yes tsx scripts/harness-pr-gate.ts --pr 63 --once` -> final status `pass`, interval seconds `180`, attempts `1/1`, 6 passing checks, 1 benign bot comment, 0 blocking comments, recommended next action `merge_or_sync`.

### Other Validation
- `bash scripts/check-repo-static.sh` -> `prompt-contract-validation: PASS (29 prompt files checked)` then `repo-static-checks-ok`.
- `bash scripts/validate-core-workflows.sh` -> `core-workflows-validation: PASS`.
- `git diff --check` -> no output.
- Cleaned generated core-workflow validation report artifacts from `reports/validation/` before staging so they do not enter the PR.

### Wiring Verification
- Package scripts: `harness:pr-gate`, `harness:pr-gate:json`, and `test:pr-gate` exist in `package.json`.
- Core validator copies/compiles `scripts/harness-pr-gate.ts`, copies/runs `tests/integration/pr-gate.test.ts`, and checks package/docs wiring.
- Static validation requires `scripts/harness-pr-gate.ts`, package scripts, file-map mention, README/operator workflow mentions, default 180-second interval text, and no-watch helper text.

### Behavior Changes and Risk Notes
- New operator command: `npm run harness:pr-gate -- --pr <number> --max-attempts <n>`.
- Default polling interval is 180 seconds and the helper enforces 180 seconds as the minimum interval.
- Helper is bounded by `--max-attempts` and does not create/merge PRs or make source fixes automatically.
- Risk: GitHub CLI JSON fields can change; helper fails loudly if `gh` command JSON cannot be read.

## Work Summary (2026-05-03 16:16 local) - validator numbering fix

### Goal
- Fix a review-time polish issue in the core workflow validator check numbering after adding the PR-gate check.

### Files Changed
- `scripts/validate-core-workflows.sh` — renamed the package/docs wiring check from duplicate `8.` to `9.` and gave it a matching temp output filename.

### Validation
- `bash scripts/check-repo-static.sh` -> `prompt-contract-validation: PASS (29 prompt files checked)` then `repo-static-checks-ok`.
- `bash scripts/validate-core-workflows.sh --report /tmp/pr-gate-core.md --summary-json /tmp/pr-gate-core.json` -> `core-workflows-validation: PASS`.
- `git diff --check` -> no output.

## Review (2026-05-03 16:20 local) - working-tree PR gate helper diff

### Reviewed
- Repo: `/Users/subhajlimanond/dev/ma-code-worktrees/task-1777797349746-pr-gate-helper`
- Branch: `task/task-1777797349746-pr-gate-helper`
- Scope: working-tree helper/test/docs/validator diff for no-watch PR CI/security gate polling.
- Commands Run: `git status --short`, `git diff --name-only`, `git diff --stat`, targeted diff inspection for `scripts/harness-pr-gate.ts`, `tests/integration/pr-gate.test.ts`, `package.json`, `scripts/validate-core-workflows.sh`, `scripts/check-repo-static.sh`, README/operator/validation/file-map docs; three direct `npx --yes tsx --test tests/integration/pr-gate.test.ts` runs; live `npx --yes tsx scripts/harness-pr-gate.ts --pr 63 --once`; `bash scripts/check-repo-static.sh`; `bash scripts/validate-core-workflows.sh`; `git diff --check`.

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
- Assumption: a bounded max-attempt helper is acceptable for “until done” in this harness because unbounded loops are intentionally avoided.
- Assumption: GitHub issue comments plus review states are sufficient for operator gate triage; inline review comments are represented through review state/body rather than fetched separately.
- Assumption: successful Dependency Review bot comments are benign, while non-bot comments and changes-requested reviews should be surfaced as fix-required.

### Recommended Tests / Validation
- Already run and passing: new integration test x3, live PR #63 one-shot helper proof, repo static checks, core-workflows validator, and diff whitespace check.
- PR CI should pass Repo Static Checks, Foundation Extension Compile, Routing Validators, Dependency Review, and CodeQL before merge.

### Rollout Notes
- New command: `npm run harness:pr-gate -- --pr <number> --max-attempts <n>`.
- Use `--once` for one terminal snapshot after a PR is already merged/passing.
- Do not use `gh pr checks --watch`; this helper polls every 180 seconds by default and never passes `--watch` to `gh`.
