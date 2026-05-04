# Coding Log — require-implementation-tdd-slice

- Date: 2026-05-04
- Scope: Require `tddSlice` for implementation packets only.
- Status: in_progress
- Branch: `split/task-1777910689745-require-implementation-tdd-slice`
- Task: `task-1777910689745`
- Related planning log: `reports/planning/2026-05-04_require-implementation-tdd-slice-plan.md`

## Discovery Path
- Read `AGENTS.md`, `README.md`, and `logs/CURRENT.md`.
- Attempted Auggie first for bounded repo discovery; it timed out.
- Used local `read`/`rg` fallback to inspect task-packet runtime/schema/validator surfaces and queue-runner packet generation paths.

## TDD Plan
- First tracer-bullet behavior: implementation packets fail when `tddSlice` is missing, while non-implementation packets continue to validate without it.
- Public interface: `generateTaskPacket(...)` plus `bash scripts/validate-task-packets.sh`.
- Boundary dependencies/mock plan: existing packet policy/team/routing fixtures and queue-runner fixtures only; no provider-backed calls.
- Out of scope: making `tddSlice` mandatory outside implementation packets or redesigning broader queue/task architecture.

## Work Summary (2026-05-04T16:25:00Z)
- Goal of the change:
  - start the RED phase for implementation-only `tddSlice` requiredness by adding the smallest packet-level tests and validator assertions first
- Files changed and why:
  - `tests/extension-units/orchestration-helpers.test.ts`
    - added packet-level expectations that implementation packets reject missing `tddSlice` while non-implementation packets still validate without it
  - `scripts/validate-task-packets.sh`
    - added helper-level failing expectation for missing implementation `tddSlice`
    - tightened schema sanity checks to require a conditional implementation-only `tddSlice` rule
    - updated the TDD fixture wording to match the new bounded contract
- Tests added or changed:
  - added `implementation task packets require a TDD slice`
  - added `non-implementation task packets remain valid without a TDD slice`
  - added validator-script expectations for missing implementation `tddSlice` and schema conditional requiredness
- Exact RED command and key failure reason:
  - `cd /Users/subhajlimanond/dev/ma-code-worktrees/task-1777910689745-require-implementation-tdd-slice && bash scripts/validate-task-packets.sh --report /tmp/tdd-impl-red-task-packets.md --summary-json /tmp/tdd-impl-red-task-packets.json`
  - failed for the right reason because runtime generation still allows implementation packets without `tddSlice`, and the schema still lacks implementation-only conditional requiredness:
    - `expected implementation tddSlice error, got:`
    - `task packet schema must require tddSlice when workType is implementation`
- Exact GREEN command:
  - not run yet; still in RED
- Other validation commands run:
  - `cd /Users/subhajlimanond/dev/ma-code-worktrees/task-1777910689745-require-implementation-tdd-slice && npx --yes tsx --test tests/extension-units/orchestration-helpers.test.ts`
    - not usable as RED proof in this environment because the worktree does not have local npm dependencies installed (`ERR_MODULE_NOT_FOUND` for `@mariozechner/pi-ai`)
- Wiring verification evidence:
  - packet-level RED is now executable through the repo validator script, which compiles an isolated packet runtime and is therefore a better proof path than direct local `tsx` in this worktree
- Behavior changes and risk notes:
  - no product behavior changed yet; only tests/validator expectations were added
  - direct `tsx` unit runs from this worktree are dependency-sensitive, so subsequent packet/queue evidence should prefer the repo validator wrappers unless targeted installs are explicitly made available
- Follow-ups or known gaps:
  - implement runtime + schema requiredness next
  - then address queue-runner propagation/support and affected tests

## Work Summary (2026-05-04T16:38:00Z)
- Goal of the change:
  - implement implementation-only `tddSlice` requiredness in task packets, then propagate/support it through queue-runner and the affected test/validator surfaces
- Files changed and why:
  - `.pi/agent/extensions/task-packets.ts`
    - `validateTaskPacketShape(...)` now rejects `workType: "implementation"` packets that omit `tddSlice`
  - `.pi/agent/state/schemas/task-packet.schema.json`
    - added a root conditional `if/then` rule requiring `tddSlice` only when `workType` is `implementation`
  - `.pi/agent/extensions/queue-runner.ts`
    - added optional queued-job `tddSlice` support
    - preserved `tddSlice` into generated packets from explicit queue input and from structured worker-to-quality preserved packets
  - `.pi/agent/state/schemas/queue.schema.json`
    - added optional queued-job `tddSlice` metadata shape so queue payloads can carry explicit implementation TDD input
  - `tests/extension-units/orchestration-helpers.test.ts`
    - updated existing implementation-packet fixtures to include `tddSlice`
    - added explicit required-vs-optional packet tests
  - `tests/extension-units/queue-runner.test.ts`
    - added queue-job `tddSlice` fixture helpers
    - added a negative queued implementation job test proving missing explicit `tddSlice` blocks
    - added positive preservation assertions for worker packet and structured quality pickup flows
  - `tests/integration/core-workflows.test.ts`
    - added queue-job `tddSlice` fixture helper and implementation source-packet TDD metadata for the structured quality transition fixture
  - `tests/integration/queue-session.test.ts`
    - added queue-job `tddSlice` fixture helper so queued implementation session fixtures remain valid under the tighter packet contract
  - `scripts/validate-task-packets.sh`
    - now asserts implementation-only requiredness at helper/runtime and schema levels
- Tests added or changed:
  - packet helper tests for implementation-only requiredness and non-implementation omission
  - queue-runner unit test for blocked missing `tddSlice` queue input
  - queue-runner preservation assertions for generated worker/quality packets
  - validator-script assertions for runtime + schema alignment
- Exact RED command and key failure reason:
  - `cd /Users/subhajlimanond/dev/ma-code-worktrees/task-1777910689745-require-implementation-tdd-slice && bash scripts/validate-task-packets.sh --report /tmp/tdd-impl-red-task-packets.md --summary-json /tmp/tdd-impl-red-task-packets.json`
  - failed because implementation packets still generated without `tddSlice` and the schema had no implementation-only conditional rule
- Exact GREEN command:
  - `cd /Users/subhajlimanond/dev/ma-code-worktrees/task-1777910689745-require-implementation-tdd-slice && bash scripts/validate-task-packets.sh --report /tmp/tdd-impl-green1-task-packets.md --summary-json /tmp/tdd-impl-green1-task-packets.json`
- Other validation commands run:
  - `cd /Users/subhajlimanond/dev/ma-code-worktrees/task-1777910689745-require-implementation-tdd-slice && bash scripts/validate-task-packets.sh --report /tmp/tdd-impl-green2-task-packets.md --summary-json /tmp/tdd-impl-green2-task-packets.json`
  - `cd /Users/subhajlimanond/dev/ma-code-worktrees/task-1777910689745-require-implementation-tdd-slice && bash scripts/validate-task-packets.sh --report /tmp/tdd-impl-green3-task-packets.md --summary-json /tmp/tdd-impl-green3-task-packets.json`
  - `cd /Users/subhajlimanond/dev/ma-code-worktrees/task-1777910689745-require-implementation-tdd-slice && bash scripts/validate-queue-runner.sh --skip-live --report /tmp/tdd-impl-queue-runner-redgreen.md --summary-json /tmp/tdd-impl-queue-runner-redgreen.json`
  - `cd /Users/subhajlimanond/dev/ma-code-worktrees/task-1777910689745-require-implementation-tdd-slice && bash scripts/validate-queue-runner.sh --skip-live --report /tmp/tdd-impl-queue-runner-flake2.md --summary-json /tmp/tdd-impl-queue-runner-flake2.json`
  - `cd /Users/subhajlimanond/dev/ma-code-worktrees/task-1777910689745-require-implementation-tdd-slice && bash scripts/validate-queue-runner.sh --skip-live --report /tmp/tdd-impl-queue-runner-flake3.md --summary-json /tmp/tdd-impl-queue-runner-flake3.json`
  - `cd /Users/subhajlimanond/dev/ma-code-worktrees/task-1777910689745-require-implementation-tdd-slice && bash scripts/validate-extension-unit-tests.sh --report /tmp/tdd-impl-extension-units.md --summary-json /tmp/tdd-impl-extension-units.json`
  - `cd /Users/subhajlimanond/dev/ma-code-worktrees/task-1777910689745-require-implementation-tdd-slice && bash scripts/validate-core-workflows.sh --report /tmp/tdd-impl-core-workflows.md --summary-json /tmp/tdd-impl-core-workflows.json`
  - `cd /Users/subhajlimanond/dev/ma-code-worktrees/task-1777910689745-require-implementation-tdd-slice && bash scripts/validate-handoffs.sh --report /tmp/tdd-impl-handoffs.md --summary-json /tmp/tdd-impl-handoffs.json`
  - `cd /Users/subhajlimanond/dev/ma-code-worktrees/task-1777910689745-require-implementation-tdd-slice && bash scripts/validate-queue-semantics.sh --report /tmp/tdd-impl-queue-semantics.md --summary-json /tmp/tdd-impl-queue-semantics.json`
  - `cd /Users/subhajlimanond/dev/ma-code-worktrees/task-1777910689745-require-implementation-tdd-slice && bash scripts/check-foundation-extension-compile.sh`
  - `cd /Users/subhajlimanond/dev/ma-code-worktrees/task-1777910689745-require-implementation-tdd-slice && bash scripts/check-repo-static.sh`
  - `cd /Users/subhajlimanond/dev/ma-code-worktrees/task-1777910689745-require-implementation-tdd-slice && git diff --check`
- Wiring verification evidence:
  - queue-runner now copies queued-job `tddSlice` into generic implementation packet inputs and preserves `handoff.preservedPacket.tddSlice` into structured quality/validator packet inputs
  - queue schema now exposes optional queued-job `tddSlice`, so explicit queue payloads and queue semantics validation agree with the runtime surface
  - core workflow validator summary reports PASS for both `core workflow integration tests` and `queue session integration surface`, so the stricter packet rule did not break downstream queue-session/core-workflow wiring
- Behavior changes and risk notes:
  - implementation packets now fail fast without explicit `tddSlice`
  - queued implementation jobs now need explicit `tddSlice` input unless they inherit it from a structured preserved packet
  - test fixtures now supply deterministic TDD metadata through local helpers because most queue-behavior tests are not about TDD content itself
- Follow-ups or known gaps:
  - there is still no dedicated standalone `validate-queue-session.sh`; broader queue-session proof came through `validate-core-workflows.sh`, whose summary explicitly includes `queue session integration surface`
  - docs/examples for queue-job JSON were not widened in this slice because the new queue `tddSlice` field is optional and runtime/tests already prove the executable path

## Review (2026-05-04T16:16:22Z) - working-tree

### Reviewed
- Repo: `/Users/subhajlimanond/dev/ma-code-worktrees/task-1777910689745-require-implementation-tdd-slice`
- Branch: `split/task-1777910689745-require-implementation-tdd-slice`
- Scope: `working-tree`
- Commands Run:
  - `git status --porcelain=v1`
  - `git branch --show-current`
  - `git diff --name-only`
  - `git diff --stat`
  - `git diff -- logs/CURRENT.md`
  - `read logs/CURRENT.md`
  - `read logs/coding/2026-05-04_require-implementation-tdd-slice.md`
  - `read reports/planning/2026-05-04_require-implementation-tdd-slice-plan.md`

### Findings
CRITICAL
- none

HIGH
- The prepared worktree does not contain any implementation/test/schema changes yet; `git status --porcelain=v1` shows only `logs/CURRENT.md` modified plus new planning/coding log files. That means the acceptance criteria around rejecting implementation packets without `tddSlice`, preserving queue-runner flows, and passing validators are not met yet. Fix direction: reroute this task to `g-coding` and apply the planned changes in `.pi/agent/extensions/task-packets.ts`, `.pi/agent/state/schemas/task-packet.schema.json`, `.pi/agent/extensions/queue-runner.ts`, the affected tests, and `scripts/validate-task-packets.sh`, then capture RED/GREEN evidence.

MEDIUM
- The only working-tree diff is the local `logs/CURRENT.md` pointer update for the dedicated worktree. If implementation/validation commands are run from the root repo on `main` instead of this worktree, evidence will land in the wrong active log and any attempted mutation risks violating the branch/worktree discipline. Fix direction: run all follow-up mutation and validation commands from `/Users/subhajlimanond/dev/ma-code-worktrees/task-1777910689745-require-implementation-tdd-slice`.

LOW
- none

### Open Questions / Assumptions
- Assumption: this review target is the prepared implementation worktree, not the clean root `main` worktree, because the prepared branch/log pointer changes exist only in the dedicated worktree.
- Assumption: the untracked planning/coding logs are intentional preparation artifacts and should remain part of the bounded review set once product changes are added.

### Recommended Tests / Validation
- After implementation begins, run `bash scripts/validate-task-packets.sh` first to prove implementation-only `tddSlice` requiredness.
- Run the smallest affected queue-runner/core-workflow tests next, such as targeted `npx --yes tsx --test tests/extension-units/queue-runner.test.ts`, and only widen to integration tests that actually fail.
- Run `git diff --check` before commit/PR.

### Rollout Notes
- No product-code rollout is ready yet; this worktree is still in the planning/preparation stage.
- The next safe step is implementation in the prepared non-main worktree, followed by a fresh g-check review once product changes exist.

Review Verdict: changes_required

## Review (2026-05-04T16:32:38Z) - working-tree

### Reviewed
- Repo: `/Users/subhajlimanond/dev/ma-code-worktrees/task-1777910689745-require-implementation-tdd-slice`
- Branch: `split/task-1777910689745-require-implementation-tdd-slice`
- Scope: `working-tree`
- Commands Run:
  - `git status --porcelain=v1`
  - `git branch --show-current`
  - `git diff --stat`
  - `git diff --name-only`
  - `git diff -- .pi/agent/extensions/task-packets.ts .pi/agent/state/schemas/task-packet.schema.json scripts/validate-task-packets.sh tests/extension-units/orchestration-helpers.test.ts`
  - `git diff -- .pi/agent/extensions/queue-runner.ts .pi/agent/state/schemas/queue.schema.json tests/extension-units/queue-runner.test.ts tests/integration/core-workflows.test.ts tests/integration/queue-session.test.ts`
  - `bash scripts/validate-task-packets.sh --report /tmp/tdd-impl-green3-task-packets.md --summary-json /tmp/tdd-impl-green3-task-packets.json`
  - `bash scripts/validate-queue-runner.sh --skip-live --report /tmp/tdd-impl-queue-runner-flake3.md --summary-json /tmp/tdd-impl-queue-runner-flake3.json`
  - `bash scripts/validate-extension-unit-tests.sh --report /tmp/tdd-impl-extension-units.md --summary-json /tmp/tdd-impl-extension-units.json`
  - `bash scripts/validate-core-workflows.sh --report /tmp/tdd-impl-core-workflows.md --summary-json /tmp/tdd-impl-core-workflows.json`
  - `bash scripts/validate-handoffs.sh --report /tmp/tdd-impl-handoffs.md --summary-json /tmp/tdd-impl-handoffs.json`
  - `bash scripts/validate-queue-semantics.sh --report /tmp/tdd-impl-queue-semantics.md --summary-json /tmp/tdd-impl-queue-semantics.json`
  - `bash scripts/check-foundation-extension-compile.sh`
  - `bash scripts/check-repo-static.sh`
  - `git diff --check`

### Findings
CRITICAL
- none

HIGH
- none

MEDIUM
- none

LOW
- The broader queue/core integration tests rely on local test helpers to inject deterministic `tddSlice` defaults for queued implementation fixtures that are not directly about TDD metadata. This is acceptable for fixture maintenance because a dedicated negative queue-runner test now bypasses that helper and proves the real runtime blocks missing explicit `tddSlice` input, but future tests should keep using the raw-write path when they need to prove missing-input behavior.

### Open Questions / Assumptions
- Assumption: keeping queue-job `tddSlice` optional in `queue.schema.json` is intentional because non-implementation jobs still omit it and implementation enforcement occurs at generated packet validation time.
- Assumption: `validate-core-workflows.sh` is sufficient queue-session integration proof for this slice because its summary explicitly reports `queue session integration surface` PASS and there is no dedicated `validate-queue-session.sh` wrapper in this repo.

### Recommended Tests / Validation
- `bash scripts/validate-task-packets.sh --report /tmp/tdd-impl-green3-task-packets.md --summary-json /tmp/tdd-impl-green3-task-packets.json`
- `bash scripts/validate-queue-runner.sh --skip-live --report /tmp/tdd-impl-queue-runner-flake3.md --summary-json /tmp/tdd-impl-queue-runner-flake3.json`
- `bash scripts/validate-extension-unit-tests.sh --report /tmp/tdd-impl-extension-units.md --summary-json /tmp/tdd-impl-extension-units.json`
- `bash scripts/validate-core-workflows.sh --report /tmp/tdd-impl-core-workflows.md --summary-json /tmp/tdd-impl-core-workflows.json`
- `bash scripts/validate-handoffs.sh --report /tmp/tdd-impl-handoffs.md --summary-json /tmp/tdd-impl-handoffs.json`
- `bash scripts/validate-queue-semantics.sh --report /tmp/tdd-impl-queue-semantics.md --summary-json /tmp/tdd-impl-queue-semantics.json`
- `bash scripts/check-foundation-extension-compile.sh`
- `bash scripts/check-repo-static.sh`
- `git diff --check`

### Rollout Notes
- Queue-job callers that enqueue `workType: "implementation"` work should now provide explicit `tddSlice` metadata unless the packet is derived from a preserved structured handoff that already carries it.
- No migration of non-implementation queue jobs is required.

Review Verdict: no_required_fixes
