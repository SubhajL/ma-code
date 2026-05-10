# Durable AFK Continuation Coding Log

## 2026-05-10T09:20:00+07:00

### Goal
- Implement durable AFK continuation so landed HITL approvals unblock/requeue AFK work through normal AFK/queue materialization paths.

### Discovery Path
- Read `AGENTS.md`, `README.md`, `logs/CURRENT.md`, and Pi log convention.
- Auggie discovery timed out; used local `rg`/file inspection.
- Inspected AFK orchestration, queue runner, issue materialization, and existing tests.
- Active task: `task-1778377949313`.
- Worktree: `/Users/subhajlimanond/dev/ma-code-worktrees/task-1778377949313-durable-afk-continuation`.
- Planning log: `reports/planning/2026-05-10_durable-afk-continuation-plan.md`.

### TDD Slice
- First tracer behavior: a landed `docs/initiatives/<initiative>/afk-approvals.json` approval for HITL `issue-001` resolves dependencies for downstream AFK issues and allows queue materialization.
- Public interface: `runAfkOrchestration` and `materializeQueueJobs` via AFK apply/dry-run tests.
- Boundary dependencies: file-backed temp initiative/queue state fixtures; no live providers.
- Out of scope: UI, live worker daemon loops, direct runtime JSON operator repairs.

### RED Evidence
- Command: `node --import tsx --test tests/extension-units/afk-orchestration.test.ts`
- Result: failed after adding tests.
- Key failure: `durable AFK approvals resolve HITL dependencies for queue materialization` expected done issues `["issue-001"]` but actual was `[]`; AFK orchestration ignored landed approval evidence.
- Narrow command: `node --import tsx --test --test-name-pattern 'durable AFK approvals' tests/extension-units/afk-orchestration.test.ts`
- Key failure excerpt: `actual: [], expected: [ 'issue-001' ], operator: 'deepStrictEqual'`.

### Changes
- `.pi/agent/extensions/afk-orchestration.ts`
  - Added `AfkIssueApproval` and optional `afk-approvals.json` loading.
  - Treats durable approvals as resolving only HITL/approval-gated issue blockers.
  - Includes approval artifact path in queue job provenance when present.
  - Reports requeued stale blocked queue jobs in AFK apply/run last action.
- `.pi/agent/extensions/queue-runner.ts`
  - Extended `materializeQueueJobs` result with `requeuedJobs`.
  - Replaces existing blocked jobs with fresh queued materialized jobs when the source issue is now eligible.
- `tests/extension-units/afk-orchestration.test.ts`
  - Added durable approval dependency-resolution coverage.
  - Added stale blocked AFK queue requeue coverage.
- Logs/planning updated for lifecycle evidence.

### GREEN Evidence
- Command: `node --import tsx --test tests/extension-units/afk-orchestration.test.ts`
- Result: pass; `tests 10`, `pass 10`, `fail 0`.
- Command: `node --import tsx --test tests/extension-units/queue-runner.test.ts`
- Result: pass; `tests 42`, `pass 42`, `fail 0`.
- Command: `node --import tsx --test tests/integration/issue-materialization.test.ts`
- Result: pass; `tests 5`, `pass 5`, `fail 0`.
- Command: `TSX_IMPORT_PATH=/Users/subhajlimanond/dev/ma-code/node_modules/tsx/dist/loader.mjs node --import /Users/subhajlimanond/dev/ma-code/node_modules/tsx/dist/loader.mjs --test tests/extension-units/afk-orchestration.test.ts tests/integration/afk-orchestration.test.ts`
- Result: pass; `tests 13`, `pass 13`, `fail 0`.
- Flake check: same AFK unit+integration command passed 3 consecutive post-implementation runs.

### Other Validation
- `pnpm exec tsc --noEmit` was not applicable because this repo/worktree has no `tsconfig.json`.
- Worktree test dependency note: used parent symlink `/Users/subhajlimanond/dev/ma-code-worktrees/node_modules -> /Users/subhajlimanond/dev/ma-code/node_modules` for local worktree validation only; no tracked code/config change.

### Wiring Verification
- `runAfkOrchestration` now loads `docs/initiatives/<initiative>/afk-approvals.json` when present and passes approval path into `sourceArtifactPaths`.
- `harness-afk-orchestrate` already delegates to `runAfkOrchestration`; integration AFK CLI tests passed with explicit `TSX_IMPORT_PATH`.
- `materializeQueueJobs` remains the queue mutation entry point and now handles requeue of stale blocked jobs; queue-runner test suite passed.
- Issue-materialization path remains existing durable artifact path; integration issue-materialization tests passed.

### Behavior Changes
- HITL/approval-gated issues with a landed approval artifact are classified as done/resolved for AFK dependency purposes.
- Existing blocked jobs with matching materialized IDs are requeued when AFK apply/run sees them eligible again.
- Non-HITL AFK issues are not auto-completed by approvals.

### Risk Notes
- `afk-approvals.json` is a new convention; broader docs may be useful if operators will author it manually.
- Requeue replaces blocked job metadata with the freshly materialized queue job while preserving linked task/packet IDs when present.

### QCHECK
- Checked for underimplementation: approval applies only to HITL/approval-gated blockers, not arbitrary AFK completion.
- Checked for wiring gaps: AFK CLI path uses `runAfkOrchestration`; queue mutation uses `materializeQueueJobs`.
- Checked for safety: no direct operator raw runtime JSON edit path added.
- Checked tests: targeted AFK, queue-runner, and issue-materialization coverage pass.

### g-check Handoff
- Scope to review:
  - `.pi/agent/extensions/afk-orchestration.ts`
  - `.pi/agent/extensions/queue-runner.ts`
  - `tests/extension-units/afk-orchestration.test.ts`
  - planning/coding logs
- Main risks to challenge:
  - Whether `afk-approvals.json` should be documented or generated by an explicit approval command.
  - Whether replacing stale blocked job fields should preserve more historical metadata.
- Local evidence:
  - AFK unit+integration command passed 3 consecutive runs.
  - Queue-runner unit suite passed.
  - Issue-materialization integration suite passed.

### Follow-ups / Known Gaps
- Consider adding operator-facing docs for `afk-approvals.json` if this becomes a standard human approval artifact.
- Consider a dedicated approval persistence command if humans should not author approval JSON directly.

## 2026-05-10T09:32:00+07:00

### Goal
- Address self-review concern about stale blocked job metadata preservation.

### Changes
- `.pi/agent/extensions/queue-runner.ts`: requeued jobs now preserve existing notes, selected model, and initial handoff IDs when replacing stale blocked jobs with fresh materialized queued jobs.

### Validation
- Command: `node --import tsx --test tests/extension-units/queue-runner.test.ts && TSX_IMPORT_PATH=/Users/subhajlimanond/dev/ma-code/node_modules/tsx/dist/loader.mjs node --import /Users/subhajlimanond/dev/ma-code/node_modules/tsx/dist/loader.mjs --test tests/extension-units/afk-orchestration.test.ts tests/integration/afk-orchestration.test.ts`
- Result: pass; queue-runner suite and AFK unit+integration suite passed.

### Risk Notes
- No new runtime entry points; this narrows data-loss risk during stale blocked job requeue.

## 2026-05-10T09:36:00+07:00 — g-check Review Artifact

### Scope
- Working-tree diff for durable AFK continuation:
  - `.pi/agent/extensions/afk-orchestration.ts`
  - `.pi/agent/extensions/queue-runner.ts`
  - `tests/extension-units/afk-orchestration.test.ts`
  - planning/coding log updates

### Findings
- No required fixes found.

### Severity-Ordered Notes
- Critical: none.
- High: none.
- Medium: none.
- Low: consider documenting `docs/initiatives/<initiative>/afk-approvals.json` or adding a dedicated approval persistence command before broad operator use.

### Tests Required
- Already run and passing:
  - `node --import tsx --test tests/extension-units/queue-runner.test.ts`
  - `node --import tsx --test tests/integration/issue-materialization.test.ts`
  - `TSX_IMPORT_PATH=/Users/subhajlimanond/dev/ma-code/node_modules/tsx/dist/loader.mjs node --import /Users/subhajlimanond/dev/ma-code/node_modules/tsx/dist/loader.mjs --test tests/extension-units/afk-orchestration.test.ts tests/integration/afk-orchestration.test.ts`

### Review Decision
- No required fixes; change is ready for validator/reviewer inspection.
