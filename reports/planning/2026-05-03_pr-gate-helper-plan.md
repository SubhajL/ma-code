# Planning Log — pr-gate-helper

## Goal
- Add a harness helper for GitHub PR CI/security gate checks that never uses `gh pr checks --watch`.
- Default polling interval must be 180 seconds (3 minutes) between checks.
- Surface CI/security state plus review/comment context so required fixes/comments are visible.

## Scope
- Add `scripts/harness-pr-gate.ts` as an operator CLI and importable helper.
- Add integration tests with injected fake runner/sleeper to prove no `--watch` and 180-second polling.
- Wire package scripts, README/operator docs, validation architecture, file map, and core workflow validation.

## Non-goals
- Do not create or merge PRs automatically.
- Do not edit source in response to comments automatically.
- Do not poll faster than 180 seconds by default.
- Do not run live provider-backed validation.

## TDD Plan
1. Add failing integration tests importing the not-yet-existing helper and asserting no-watch polling behavior.
2. Run the new test and confirm missing module / missing implementation failure.
3. Implement the smallest helper and CLI to pass.
4. Wire package/docs/core validator.
5. Run focused validation and flake-check the new test scope.

## Validation Plan
- `node --import tsx --test tests/integration/pr-gate.test.ts`
- `bash scripts/validate-core-workflows.sh`
- `bash scripts/check-repo-static.sh`
- `git diff --check`

## Risks
- GitHub CLI JSON fields may evolve; keep runner wrapper small and failure messages explicit.
- A bounded helper cannot truly poll forever; default max attempts keeps harness behavior safe.
- Bot comments like Dependency Review should be classified as informational rather than blocking.

## Pi Log Update
- Planning log: `reports/planning/2026-05-03_pr-gate-helper-plan.md`
- Coding log: `logs/coding/2026-05-03_pr-gate-helper.md`
