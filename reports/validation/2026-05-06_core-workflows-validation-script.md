# Automated Validation Report — Core Workflows

- Date: 2026-05-06
- Generated at: 2026-05-06T09:09:58+0700
- Repo root: /Users/subhajlimanond/dev/ma-code-worktrees/task-1778032956826-phase-0-slice-1
- Node binary: node
- npm binary: npm
- Python binary: python3
- Temporary root: /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.0Ei1eapQZv

## Summary Table

| Check | Status | Notes |
|---|---|---|
| 1. core workflow extensions compile together | PASS | safe-bash, till-done, queue-runner, Graphify orchestration, and the operator-facing status/queue-session/scheduled-workflow/worktree/PR-gate/sync-main helper scripts compile together with their routing/team/packet/handoff/recovery dependencies in an isolated runtime package. |
| 2. core workflow integration tests | PASS | integration tests passed for docs-only completion, implementation pass, validation fail visibility, recovery finalization, and safe-bash/provider recovery block handling. |
| 3. operator status integration surface | PASS | operator status integration tests passed for readable text output and stable JSON output from the lightweight CLI status surface. |
| 4. queue session integration surface | PASS | queue session integration tests passed for waiting-point starts, finalize-then-start chaining with invalid-queue skipping, blocked+failed visibility, paused-queue boundaries, recovery-action triage visibility, scheduled-workflow job provenance through sessions, and explicit max-step/max-runtime stopping. |
| 5. worktree helper integration surface | PASS | worktree helper integration tests passed for predictable branch/path naming, bounded worktree creation, review-prep inspection, and conservative cleanup blocking. |
| 6. scheduled workflow integration surface | PASS | scheduled workflow integration tests passed for due/disabled status inspection, explicit materialization, duplicate blocking, and unsupported schedule rejection. |
| 7. Graphify adapter fake-binary integration | PASS | Graphify adapter integration test passed with a fake binary, managed artifact output, exclusion arguments, and metadata proof. |
| 8. PR gate helper integration surface | PASS | PR gate helper integration tests passed for no-watch polling, 180-second intervals, terminal pass/fail handling, and comment/review triage. |
| 9. sync-main helper integration surface | PASS | sync-main helper integration tests passed for fast-forward-only local main sync, ignored runtime bookkeeping preservation, and non-bookkeeping tracked-dirt blocking. |
| 10. operator/queue-session/schedule/worktree/PR-gate/sync-main package/docs wiring | PASS | operator status, queue-session, scheduled workflow, worktree, PR gate, and sync-main helper wiring is present in package scripts, README, and validation/operator docs. |

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
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.0Ei1eapQZv/core-workflows-runtime && npx tsc --noEmit --skipLibCheck --allowImportingTsExtensions --moduleResolution nodenext --module nodenext --target es2022 --lib es2022,dom --types node .pi/agent/extensions/safe-bash.ts .pi/agent/extensions/till-done.ts .pi/agent/extensions/harness-routing.ts .pi/agent/extensions/team-activation.ts .pi/agent/extensions/task-packets.ts .pi/agent/extensions/handoffs.ts .pi/agent/extensions/recovery-policy.ts .pi/agent/extensions/recovery-runtime.ts .pi/agent/extensions/queue-runner.ts .pi/agent/extensions/graphify-adapter.ts .pi/agent/extensions/graphify-validation-decision.ts .pi/agent/extensions/graphify-orchestration-decision.ts .pi/agent/extensions/graphify-orchestrator.ts scripts/harness-operator-status.ts scripts/harness-queue-session.ts scripts/harness-scheduled-workflows.ts scripts/harness-worktree.ts scripts/harness-pr-gate.ts scripts/harness-sync-main.ts
```

### Key Evidence
- output:

```

```

## 2. core workflow integration tests
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.0Ei1eapQZv/core-workflows-runtime && node --import tsx --test tests/integration/core-workflows.test.ts
```

### Key Evidence
- output:

```
✔ docs-only workflow allows lighter review validation and completion (22.0425ms)
✔ implementation workflow can start from the queue, pass validation, and finalize cleanly (10.14725ms)
✔ validation fail workflow keeps the failed task visible with validator evidence (5.02075ms)
✔ quality workflow can start from a queued structured worker_to_quality handoff (5.542584ms)
✔ quality queue job blocks when structured worker_to_quality input is missing (4.473834ms)
✔ validator workflow can start from a queued structured quality_to_validator handoff (4.599334ms)
✔ validator queue job blocks when structured quality_to_validator input is missing (4.670958ms)
✔ recovery path finalizes a failed queue job with a bounded retry recommendation (7.509416ms)
✔ provider/tool block workflow exercises safe-bash blocking and bounded recovery guidance (4.514583ms)
ℹ tests 9
ℹ suites 0
ℹ pass 9
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 899.049583
```

## 3. operator status integration surface
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.0Ei1eapQZv/core-workflows-runtime && node --import tsx --test tests/integration/operator-surface.test.ts
```

### Key Evidence
- output:

```
✔ operator status surface renders a readable queue/task snapshot (4.660084ms)
✔ operator status surface can be serialized as stable JSON data (2.291834ms)
ℹ tests 2
ℹ suites 0
ℹ pass 2
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 581.193667
```

## 4. queue session integration surface
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.0Ei1eapQZv/core-workflows-runtime && node --import tsx --test tests/integration/queue-session.test.ts
```

### Key Evidence
- output:

```
✔ queue session starts one queued job and stops at the next waiting point (27.369917ms)
✔ queue session can finalize visible terminal work and immediately start the next queued job (16.871875ms)
✔ queue session can finalize active work, skip invalid queued work, and start the next eligible job (17.107709ms)
✔ queue session keeps previously blocked and failed jobs visible while starting new work (15.5935ms)
✔ queue session stops immediately when the queue is already paused and recommends resume when work remains (11.457083ms)
✔ queue session exposes recovery-action visibility after finalizing a failed active job (19.064959ms)
✔ scheduled-workflow-created jobs can move into bounded queue sessions with preserved provenance (23.620166ms)
✔ queue session respects max-step limits instead of continuing implicitly (15.63825ms)
✔ queue session respects maxRuntimeSeconds before a second step can begin (14.213958ms)
✔ queue session triage recommends blocked-job review when the session ends on blocked queue state (10.302458ms)
✔ queue session CLI requires an explicit task id or operator scope (0.364042ms)
✔ queue session renders explicit operator task and scope without backgrounding (8.78ms)
✔ queue session stops before work on dirty tracked files (69.976792ms)
✔ queue session stops before work on protected dirty paths (59.101083ms)
✔ queue session stops before work on approval-required queued jobs (7.924833ms)
ℹ tests 15
ℹ suites 0
ℹ pass 15
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 902.348042
```

## 5. worktree helper integration surface
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.0Ei1eapQZv/core-workflows-runtime && node --import tsx --test tests/integration/worktree-helper.test.ts
```

### Key Evidence
- output:

```
✔ worktree helper creates, inspects, prepares review, and cleans up a bounded worktree (295.79475ms)
✔ worktree helper refuses to remove a dirty linked worktree (175.646375ms)
ℹ tests 2
ℹ suites 0
ℹ pass 2
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 607.579708
```

## 6. scheduled workflow integration surface
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.0Ei1eapQZv/core-workflows-runtime && node --import tsx --test tests/integration/scheduled-workflows.test.ts
```

### Key Evidence
- output:

```
✔ scheduled workflow status reports due, weekday-gated, and manual-disabled items (6.397625ms)
✔ scheduled workflow materialization is explicit and duplicate-safe (4.349833ms)
✔ scheduled workflow config rejects unsupported schedule types (1.509ms)
ℹ tests 3
ℹ suites 0
ℹ pass 3
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 148.599542
```

## 7. Graphify adapter fake-binary integration
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.0Ei1eapQZv/core-workflows-runtime && node --import tsx --test tests/integration/graphify-adapter.test.ts
```

### Key Evidence
- output:

```
✔ Graphify adapter invokes fake binary with real CLI update shape in managed artifact cwd (516.027208ms)
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 705.23425
```

## 8. PR gate helper integration surface
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.0Ei1eapQZv/core-workflows-runtime && node --import tsx --test tests/integration/pr-gate.test.ts
```

### Key Evidence
- output:

```
✔ PR gate helper polls every 180 seconds without gh --watch until checks pass (1.390833ms)
✔ PR gate helper stops on failed checks and surfaces non-bot comments (0.190625ms)
ℹ tests 2
ℹ suites 0
ℹ pass 2
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 136.299292
```

## 9. sync-main helper integration surface
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.0Ei1eapQZv/core-workflows-runtime && node --import tsx --test tests/integration/sync-main.test.ts
```

### Key Evidence
- output:

```
✔ sync helper fast-forwards main and preserves ignored runtime bookkeeping (298.773875ms)
✔ sync helper blocks when non-bookkeeping tracked files are dirty (229.856875ms)
ℹ tests 2
ℹ suites 0
ℹ pass 2
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 662.712541
```

## 10. operator/queue-session/schedule/worktree/PR-gate/sync-main package/docs wiring
- Status: PASS

### Command
```bash
python3 /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.0Ei1eapQZv/check_6_operator_surface_wiring.py
```

### Key Evidence
- output:

```
operator-queue-session-schedule-worktree-pr-gate-sync-main-wiring-ok
```

## Final Decision
- Overall status: PASS
- Failed checks: 0
- Summary JSON: /Users/subhajlimanond/dev/ma-code-worktrees/task-1778032956826-phase-0-slice-1/reports/validation/2026-05-06_core-workflows-validation-script.json
- Operator Next Step: Use this report plus the current coding log as bounded validation evidence; drill into Detailed Results only if you want raw command output.
