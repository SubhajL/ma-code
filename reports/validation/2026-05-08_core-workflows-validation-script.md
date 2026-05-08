# Automated Validation Report — Core Workflows

- Date: 2026-05-08
- Generated at: 2026-05-08T12:32:55+0700
- Repo root: /Users/subhajlimanond/dev/ma-code-worktrees/task-1778217816110-phase12-parallel-worker-lanes
- Node binary: node
- npm binary: npm
- Python binary: python3
- Temporary root: /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.0shYVUR3dL

## Summary Table

| Check | Status | Notes |
|---|---|---|
| 1. core workflow extensions compile together | PASS | safe-bash, till-done, queue-runner, Graphify orchestration, and the operator-facing operator/status/leases/queue-session/scheduled-workflow/worktree/integrate/worker-session/PR-gate/sync-main helper scripts compile together with their routing/team/packet/handoff/recovery dependencies in an isolated runtime package. |
| 2. core workflow integration tests | PASS | integration tests passed for docs-only completion, implementation pass, validation fail visibility, recovery finalization, and safe-bash/provider recovery block handling. |
| 3. operator status integration surface | PASS | operator status integration tests passed for readable text output and stable JSON output from the lightweight CLI status surface. |
| 4. operator leases integration surface | PASS | operator lease integration tests passed for text/JSON list output and stale-only cleanup that preserves active leases. |
| 4a. unified operator control-plane integration surface | PASS | operator control-plane integration tests passed for help, delegated status/queue-session/worktree/leases/worker-session behavior, unknown-subcommand failure, and delegated non-zero exit handling. |
| 4b. slice lifecycle integration surface | PASS | slice lifecycle integration tests passed for create_ready, missing GREEN/g-check blockers, merge_ready, and explicit merged/local-main-synced evidence. |
| 4c. merge helper integration surface | PASS | merge helper integration tests passed for lifecycle readiness blockers, ready checks, dirty apply blocking, successful apply, and explicit-only sync-main behavior. |
| 4. queue session integration surface | PASS | queue session integration tests passed for waiting-point starts, finalize-then-start chaining with invalid-queue skipping, blocked+failed visibility, paused-queue boundaries, recovery-action triage visibility, scheduled-workflow job provenance through sessions, and explicit max-step/max-runtime stopping. |
| 5. worktree helper integration surface | PASS | worktree helper integration tests passed for predictable branch/path naming, bounded worktree creation, review-prep inspection, and conservative cleanup blocking. |
| 6. worker session integration surface | PASS | worker session integration tests passed for start/status/release, lease metadata, clean cleanup, and dirty-cleanup refusal. |
| 6. scheduled workflow integration surface | PASS | scheduled workflow integration tests passed for due/disabled status inspection, explicit materialization, duplicate blocking, and unsupported schedule rejection. |
| 7. Graphify adapter fake-binary integration | PASS | Graphify adapter integration test passed with a fake binary, managed artifact output, exclusion arguments, and metadata proof. |
| 8. integrate-worktree helper integration surface | PASS | integrate-worktree helper integration tests passed for fast-forward local main integration, tracked-dirt blocking, and allowed generated validation artifacts. |
| 8. PR gate helper integration surface | PASS | PR gate helper integration tests passed for no-watch polling, 180-second intervals, terminal pass/fail handling, and comment/review triage. |
| 9. sync-main helper integration surface | PASS | sync-main helper integration tests passed for fast-forward-only local main sync, ignored runtime bookkeeping preservation, and non-bookkeeping tracked-dirt blocking. |
| 10. operator/control-plane/queue-session/integrate/worker-session/schedule/worktree/PR-gate/sync-main package/docs wiring | PASS | operator wrapper, status, leases, queue-session, integrate, worker-session, scheduled workflow, worktree, PR gate, sync-main, and slice lifecycle helper wiring is present in package scripts, README, and validation/operator docs. |

## How to Read This Report
- Scan validator reports in this order:
  1. Summary Table
  2. Final Decision
  3. Detailed Results
- Use Summary Table for the quick pass/fail view across all core workflow surfaces.
- Use Final Decision for the operator-facing verdict, failed-check count, and recommended next step.
- Use Detailed Results only when you need the raw command/evidence for one check.

## Detailed Results

## 1. core workflow extensions compile together
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.0shYVUR3dL/core-workflows-runtime && npx tsc --noEmit --skipLibCheck --allowImportingTsExtensions --moduleResolution nodenext --module nodenext --target es2022 --lib es2022,dom --types node .pi/agent/extensions/safe-bash.ts .pi/agent/extensions/till-done.ts .pi/agent/extensions/harness-routing.ts .pi/agent/extensions/team-activation.ts .pi/agent/extensions/domain-governance.ts .pi/agent/extensions/task-packets.ts .pi/agent/extensions/handoffs.ts .pi/agent/extensions/recovery-policy.ts .pi/agent/extensions/recovery-runtime.ts .pi/agent/extensions/execution-leases.ts .pi/agent/extensions/queue-runner.ts .pi/agent/extensions/graphify-adapter.ts .pi/agent/extensions/graphify-validation-decision.ts .pi/agent/extensions/graphify-orchestration-decision.ts .pi/agent/extensions/graphify-orchestrator.ts .pi/agent/extensions/slice-lifecycle.ts scripts/harness-operator.ts scripts/harness-operator-status.ts scripts/harness-operator-leases.ts scripts/harness-queue-session.ts scripts/harness-scheduled-workflows.ts scripts/harness-worktree.ts scripts/harness-integrate.ts scripts/harness-worker-session.ts scripts/harness-pr-gate.ts scripts/harness-sync-main.ts scripts/harness-slice-lifecycle.ts scripts/harness-merge.ts
```

### Key Evidence
- output:

```

```

## 2. core workflow integration tests
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.0shYVUR3dL/core-workflows-runtime && node --import tsx --test tests/integration/core-workflows.test.ts
```

### Key Evidence
- output:

```
✔ docs-only workflow allows lighter review validation and completion (19.112416ms)
✔ implementation workflow can start from the queue, pass validation, and finalize cleanly (17.526333ms)
✔ validation fail workflow keeps the failed task visible with validator evidence (5.44525ms)
✔ quality workflow can start from a queued structured worker_to_quality handoff (6.598167ms)
✔ quality queue job blocks when structured worker_to_quality input is missing (5.766125ms)
✔ validator workflow can start from a queued structured quality_to_validator handoff (5.307167ms)
✔ validator queue job blocks when structured quality_to_validator input is missing (4.832125ms)
✔ recovery path finalizes a failed queue job with a bounded retry recommendation (8.499042ms)
✔ provider/tool block workflow exercises safe-bash blocking and bounded recovery guidance (5.162625ms)
✔ slice lifecycle helper derives create_ready from existing planning, coding, and task evidence (11.547583ms)
ℹ tests 10
ℹ suites 0
ℹ pass 10
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1180.492583
```

## 3. operator status integration surface
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.0shYVUR3dL/core-workflows-runtime && node --import tsx --test tests/integration/operator-surface.test.ts
```

### Key Evidence
- output:

```
✔ operator status surface renders a readable queue/task snapshot (7.941417ms)
✔ operator status surface can be serialized as stable JSON data (1.47575ms)
ℹ tests 2
ℹ suites 0
ℹ pass 2
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 539.125334
```

## 4. operator leases integration surface
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.0shYVUR3dL/core-workflows-runtime && node --import tsx --test tests/integration/operator-leases.test.ts
```

### Key Evidence
- output:

```
✔ operator lease list shows active leases in text and stable JSON (4.216ms)
✔ operator lease list handles empty lease state clearly (0.800416ms)
✔ clear-stale removes stale leases while preserving active leases (1.696709ms)
✔ clear-stale leaves active-only lease state intact (1.068584ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 134.075167
```

## 4a. unified operator control-plane integration surface
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.0shYVUR3dL/core-workflows-runtime && node --import tsx --test tests/integration/operator-control-plane.test.ts
```

### Key Evidence
- output:

```
✔ harness-operator help shows the supported subcommands (110.39ms)
✔ harness-operator status delegates to the status surface (650.780833ms)
✔ harness-operator queue-session delegates passthrough help with nested separator (627.153125ms)
✔ harness-operator worktree delegates to the worktree status surface (284.936916ms)
✔ harness-operator leases delegates to the leases surface (212.810708ms)
✔ harness-operator worker-session delegates to the worker-session surface (816.7035ms)
✔ harness-operator rejects unknown subcommands clearly (99.675458ms)
✔ harness-operator preserves delegated non-zero exit codes (627.01525ms)
ℹ tests 8
ℹ suites 0
ℹ pass 8
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 3553.03675
```

## 4b. slice lifecycle integration surface
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.0shYVUR3dL/core-workflows-runtime && node --import tsx --test tests/integration/slice-lifecycle.test.ts
```

### Key Evidence
- output:

```
✔ CLI check reports create_ready for planning, RED/GREEN, and g-check evidence (155.135167ms)
✔ CLI check blocks create_ready when GREEN evidence is missing (114.75725ms)
✔ CLI check blocks create_ready when g-check evidence is missing (111.749958ms)
✔ submit plus PR-gate evidence reaches merge_ready (114.208208ms)
✔ explicit merge and sync evidence can satisfy local_main_synced (112.64625ms)
ℹ tests 5
ℹ suites 0
ℹ pass 5
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 729.5855
```

## 4c. merge helper integration surface
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.0shYVUR3dL/core-workflows-runtime && node --import tsx --test tests/integration/merge-helper.test.ts
```

### Key Evidence
- output:

```
✔ check reports blocked when lifecycle readiness is missing (73.2825ms)
✔ check reports ready when lifecycle and PR gate preconditions pass (64.862084ms)
✔ apply blocks dirty local state before merge (65.651917ms)
✔ apply succeeds only when policy passes and sync-main is explicit (64.72875ms)
✔ apply without --sync-main does not run sync-main (65.163583ms)
ℹ tests 5
ℹ suites 0
ℹ pass 5
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 464.380125
```

## 4. queue session integration surface
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.0shYVUR3dL/core-workflows-runtime && node --import tsx --test tests/integration/queue-session.test.ts
```

### Key Evidence
- output:

```
✔ queue session starts one queued job and stops at the next waiting point (20.003417ms)
✔ queue session can finalize visible terminal work and immediately start the next queued job (17.604042ms)
✔ queue session can finalize active work, skip invalid queued work, and start the next eligible job (16.274167ms)
✔ queue session keeps previously blocked and failed jobs visible while starting new work (10.748625ms)
✔ queue session stops immediately when the queue is already paused and recommends resume when work remains (8.4045ms)
✔ queue session exposes recovery-action visibility after finalizing a failed active job (25.7435ms)
✔ bounded queue session stops immediately when a queue-session lease is already active (8.004834ms)
✔ scheduled-workflow-created jobs can move into bounded queue sessions with preserved provenance (10.182917ms)
✔ queue session respects max-step limits instead of continuing implicitly (13.159709ms)
✔ queue session respects maxRuntimeSeconds before a second step can begin (12.734ms)
✔ queue session triage recommends blocked-job review when the session ends on blocked queue state (10.024834ms)
✔ queue session CLI requires an explicit task id or operator scope (0.33275ms)
✔ queue session renders explicit operator task and scope without backgrounding (7.976917ms)
✔ queue session stops before work on dirty tracked files (47.3085ms)
✔ queue session stops before work on protected dirty paths (48.970083ms)
✔ queue session stops before work on approval-required queued jobs (6.196917ms)
ℹ tests 16
ℹ suites 0
ℹ pass 16
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 812.358584
```

## 5. worktree helper integration surface
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.0shYVUR3dL/core-workflows-runtime && node --import tsx --test tests/integration/worktree-helper.test.ts
```

### Key Evidence
- output:

```
✔ worktree helper creates, inspects, prepares review, and cleans up a bounded worktree (235.220916ms)
✔ worktree helper refuses to remove a dirty linked worktree (139.492958ms)
ℹ tests 2
ℹ suites 0
ℹ pass 2
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 501.815666
```

## 6. worker session integration surface
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.0shYVUR3dL/core-workflows-runtime && node --import tsx --test tests/integration/worker-session.test.ts
```

### Key Evidence
- output:

```
✔ worker-session start creates a bounded worktree and records a worker-lane lease (100.72275ms)
✔ worker-session status reports the worker-lane lease and worktree cleanliness (116.610334ms)
✔ worker-session release clears the lease and preserves the worktree by default (109.622709ms)
✔ worker-session release --cleanup removes a clean worktree (154.382416ms)
✔ worker-session release --cleanup fails safely on a dirty worktree and leaves lease/worktree intact (110.817958ms)
ℹ tests 5
ℹ suites 0
ℹ pass 5
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 719.918334
```

## 6. scheduled workflow integration surface
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.0shYVUR3dL/core-workflows-runtime && node --import tsx --test tests/integration/scheduled-workflows.test.ts
```

### Key Evidence
- output:

```
✔ scheduled workflow status reports due, weekday-gated, and manual-disabled items (6.076375ms)
✔ scheduled workflow materialization is explicit and duplicate-safe (4.036833ms)
✔ scheduled workflow config rejects unsupported schedule types (0.839375ms)
ℹ tests 3
ℹ suites 0
ℹ pass 3
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 136.73625
```

## 7. Graphify adapter fake-binary integration
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.0shYVUR3dL/core-workflows-runtime && node --import tsx --test tests/integration/graphify-adapter.test.ts
```

### Key Evidence
- output:

```
✔ Graphify adapter invokes fake binary with real CLI update shape in managed artifact cwd (530.375375ms)
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 703.533708
```

## 8. integrate-worktree helper integration surface
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.0shYVUR3dL/core-workflows-runtime && node --import tsx --test tests/integration/integrate-worktree.test.ts
```

### Key Evidence
- output:

```
✔ integration helper fast-forwards main from a clean linked worktree and tolerates generated validation artifacts (208.8185ms)
✔ integration helper succeeds as already_current when source worktree is clean and already merged (154.311709ms)
✔ integration helper blocks when root main has dirty tracked files (104.07725ms)
✔ integration helper blocks when source branch is not a fast-forward of main (194.900875ms)
✔ integration helper blocks when source worktree is not merge-ready (142.860208ms)
ℹ tests 5
ℹ suites 0
ℹ pass 5
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 932.590334
```

## 8. PR gate helper integration surface
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.0shYVUR3dL/core-workflows-runtime && node --import tsx --test tests/integration/pr-gate.test.ts
```

### Key Evidence
- output:

```
✔ PR gate helper polls every 180 seconds without gh --watch until checks pass (1.886125ms)
✔ PR gate helper stops on failed checks and surfaces non-bot comments (0.154875ms)
ℹ tests 2
ℹ suites 0
ℹ pass 2
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 125.275666
```

## 9. sync-main helper integration surface
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.0shYVUR3dL/core-workflows-runtime && node --import tsx --test tests/integration/sync-main.test.ts
```

### Key Evidence
- output:

```
✔ sync helper fast-forwards main and preserves ignored runtime bookkeeping (252.495375ms)
✔ sync helper blocks when non-bookkeeping tracked files are dirty (189.255834ms)
ℹ tests 2
ℹ suites 0
ℹ pass 2
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 564.1015
```

## 10. operator/control-plane/queue-session/integrate/worker-session/schedule/worktree/PR-gate/sync-main package/docs wiring
- Status: PASS

### Command
```bash
python3 /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.0shYVUR3dL/check_6_operator_surface_wiring.py
```

### Key Evidence
- output:

```
operator-queue-session-schedule-worktree-pr-gate-sync-main-wiring-ok
```

## Final Decision
- Overall status: PASS
- Failed checks: 0
- Summary JSON: /Users/subhajlimanond/dev/ma-code-worktrees/task-1778217816110-phase12-parallel-worker-lanes/reports/validation/2026-05-08_core-workflows-validation-script.json
- Operator Next Step: Use this report plus the current coding log as bounded validation evidence; drill into Detailed Results only if you want raw command output.
