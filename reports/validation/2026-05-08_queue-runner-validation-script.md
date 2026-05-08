# Automated Validation Report — Queue Runner

- Date: 2026-05-08
- Generated at: 2026-05-08T12:32:42+0700
- Repo root: /Users/subhajlimanond/dev/ma-code-worktrees/task-1778217816110-phase12-parallel-worker-lanes
- Node binary: node
- npm binary: npm
- Python binary: python3
- Live probe enabled: no
- Temporary root: /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.LnnVDiM5kg

## Summary Table

| Check | Status | Notes |
|---|---|---|
| 1. queue-runner extension compiles with its shared helpers | PASS | queue-runner and its till-done/Graphify validation/orchestration/adapter/routing/team/packet/handoff/recovery dependencies compile together. |
| 2. queue-runner unit tests | PASS | queue-runner unit tests passed for empty/paused no-ops, deterministic one-job start/finalize, research Graphify orchestration, stop-condition enforcement for retries/runtime/failed validations/approval boundaries, unsupported-control blocking, compensation safety, and recovery reuse. |
| 3. queue-runner validator and docs wiring | PASS | queue-runner validator and docs wiring are present in README, operator workflow, validation architecture, static checks, and CI. |
| 4. live run_next_queue_job tool probe | SKIP | Live probe skipped because --skip-live was requested explicitly. |

## 1. queue-runner extension compiles with its shared helpers
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.LnnVDiM5kg/queue-runner-runtime && npx tsc --noEmit --skipLibCheck --allowImportingTsExtensions --moduleResolution nodenext --module nodenext --target es2022 --lib es2022,dom --types node .pi/agent/extensions/till-done.ts .pi/agent/extensions/graphify-validation-decision.ts .pi/agent/extensions/graphify-adapter.ts .pi/agent/extensions/graphify-orchestration-decision.ts .pi/agent/extensions/graphify-orchestrator.ts .pi/agent/extensions/harness-routing.ts .pi/agent/extensions/team-activation.ts .pi/agent/extensions/domain-governance.ts .pi/agent/extensions/task-packets.ts .pi/agent/extensions/handoffs.ts .pi/agent/extensions/recovery-policy.ts .pi/agent/extensions/recovery-runtime.ts .pi/agent/extensions/execution-leases.ts .pi/agent/extensions/queue-runner.ts
```

### Key Evidence
- output:

```

```

## 2. queue-runner unit tests
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.LnnVDiM5kg/queue-runner-runtime && node --import tsx --test tests/extension-units/queue-runner.test.ts
```

### Key Evidence
- output:

```
✔ queue runner exposes run_next_queue_job and preserves run_queue_once as a compatibility alias (21.691166ms)
✔ queue runner no-ops when the queue is empty (4.990333ms)
✔ run_next_queue_job blocks without advancing when another queue-session lease is active (3.49225ms)
✔ run_next_queue_job acquires and releases a short queue-session lease (4.129709ms)
✔ run_queue_once compatibility alias follows queue-session lease enforcement (3.485167ms)
✔ bounded queue session releases its lease after an idle session (5.451792ms)
✔ bounded queue session releases its lease when the session body throws (3.618667ms)
✔ queue runner no-ops when the queue is paused (4.883833ms)
✔ operator inspect queue state summarizes queue and task status (7.710084ms)
✔ operator pause and resume controls gate queue pickup (7.749208ms)
✔ bounded queue session tool starts queued work and stops at the next waiting point (5.074792ms)
✔ bounded queue session can finalize visible terminal work and start the next queued job in one invocation (10.093125ms)
✔ operator safe stop pauses queue and blocks the active linked task (5.174125ms)
✔ queue runner starts one eligible queued build job with linked task, packet, and initial handoff (4.503792ms)
✔ queue runner blocks queued implementation jobs that omit explicit tddSlice input (4.586167ms)
✔ queue runner can start a quality job from structured worker_to_quality input (5.266416ms)
✔ queue runner blocks a quality job when structured worker_to_quality input is missing (4.611916ms)
✔ queue runner can start a validator job from structured quality_to_validator input (5.080292ms)
✔ queue runner blocks a validator job when structured quality_to_validator input is missing (5.377291ms)
✔ queue runner does not start a new job while the active linked task is still non-terminal (12.592125ms)
✔ queue runner finalizes an active running job when its linked task reaches done (7.344792ms)
✔ queue runner finalizes a running job as blocked when its linked task becomes blocked and clears activeJobId (6.855667ms)
✔ queue runner compensates safely when queue activation succeeds but linked task start fails (5.881792ms)
✔ queue runner blocks jobs without acceptance criteria and starts the next eligible job (4.51425ms)
✔ queue runner blocks unsupported budget fields and unsupported free-form stop_conditions but allows supported HARNESS-049 controls (4.566083ms)
✔ queue runner blocks queued jobs whose maxUnresolvedBlockers budget is already exceeded and starts the next eligible job from the same blocker snapshot (5.856625ms)
✔ queue runner deduplicates a blocked job and its linked blocked task when enforcing maxUnresolvedBlockers (5.411166ms)
✔ queue runner blocks queued approvalRequired jobs before start (5.050709ms)
✔ queue runner logs queued approval boundary blocks to the audit log (3.792417ms)
✔ queue runner fails queued retries that already exhausted maxRetries or maxFailedValidations before restart (9.960375ms)
✔ queue runner treats retryCount plus the current validation fail as exhausting maxFailedValidations before restart (7.953334ms)
✔ queue runner allows restart when a single current validation fail is still below maxFailedValidations (7.956542ms)
✔ queue runner coordinates queue and linked task stop when approval boundary is hit on an active running job (6.588209ms)
✔ queue runner blocks the active job when normalized visible unresolved blockers exceed maxUnresolvedBlockers (5.653167ms)
✔ queue runner coordinates queue and linked task failure when active runtime exceeds maxRuntimeMinutes (5.747208ms)
✔ queue runner selects the next queued job deterministically by existing order within the same priority (9.9775ms)
✔ queue runner finalizes failed jobs with a bounded recovery recommendation (6.680958ms)
✔ bounded queue session explicitly invokes Graphify orchestration for opted-in research jobs (7.078667ms)
✔ bounded queue session does not invoke Graphify when research job lacks explicit opt in (4.308166ms)
✔ bounded queue session ignores Graphify opt in on non-research jobs (4.3375ms)
✔ bounded queue session blocks research job when explicit Graphify orchestration blocks (3.787583ms)
ℹ tests 41
ℹ suites 0
ℹ pass 41
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1251.296208
```

## 3. queue-runner validator and docs wiring
- Status: PASS

### Command
```bash
python3 /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.LnnVDiM5kg/check_3_queue_runner_wiring.py
```

### Key Evidence
- output:

```
queue-runner-wiring-ok
```

## 4. live run_next_queue_job tool probe
- Status: SKIP

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.LnnVDiM5kg/queue-runner-runtime && pi --no-session --no-extensions -e /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.LnnVDiM5kg/queue-runner-runtime/.pi/agent/extensions/till-done.ts -e /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.LnnVDiM5kg/queue-runner-runtime/.pi/agent/extensions/graphify-validation-decision.ts -e /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.LnnVDiM5kg/queue-runner-runtime/.pi/agent/extensions/harness-routing.ts -e /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.LnnVDiM5kg/queue-runner-runtime/.pi/agent/extensions/team-activation.ts -e /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.LnnVDiM5kg/queue-runner-runtime/.pi/agent/extensions/task-packets.ts -e /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.LnnVDiM5kg/queue-runner-runtime/.pi/agent/extensions/handoffs.ts -e /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.LnnVDiM5kg/queue-runner-runtime/.pi/agent/extensions/recovery-policy.ts -e /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.LnnVDiM5kg/queue-runner-runtime/.pi/agent/extensions/recovery-runtime.ts -e /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.LnnVDiM5kg/queue-runner-runtime/.pi/agent/extensions/queue-runner.ts --mode json "Use run_next_queue_job and report the returned action in one sentence."
```

### Key Evidence
- live probe not run because --skip-live was requested

## Final Decision
- Overall status: PASS
- Failed checks: 0
- Summary JSON: /Users/subhajlimanond/dev/ma-code-worktrees/task-1778217816110-phase12-parallel-worker-lanes/reports/validation/2026-05-08_queue-runner-validation-script.json
