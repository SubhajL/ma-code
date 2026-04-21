# Automated Validation Report — Queue Runner

- Date: 2026-04-21
- Generated at: 2026-04-21T20:58:53+0700
- Repo root: /Users/subhajlimanond/dev/ma-code-harness-032
- Node binary: node
- npm binary: npm
- Python binary: python3
- Live probe enabled: no
- Temporary root: /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.BYxZzTCT2o

## Summary Table

| Check | Status | Notes |
|---|---|---|
| 1. queue-runner extension compiles with its shared helpers | PASS | queue-runner and its till-done/routing/team/packet/handoff/recovery dependencies compile together. |
| 2. queue-runner unit tests | PASS | queue-runner unit tests passed for empty/paused no-ops, deterministic one-job start/finalize, invalid-job and deferred-control blocking, compensation safety, and recovery reuse. |
| 3. queue-runner validator and docs wiring | PASS | queue-runner validator and docs wiring are present in README, operator workflow, validation architecture, static checks, and CI. |
| 4. live run_next_queue_job tool probe | SKIP | Live probe skipped because --skip-live was requested explicitly. |

## 1. queue-runner extension compiles with its shared helpers
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.BYxZzTCT2o/queue-runner-runtime && npx tsc --noEmit --skipLibCheck --allowImportingTsExtensions --moduleResolution nodenext --module nodenext --target es2022 --lib es2022,dom --types node .pi/agent/extensions/till-done.ts .pi/agent/extensions/harness-routing.ts .pi/agent/extensions/team-activation.ts .pi/agent/extensions/task-packets.ts .pi/agent/extensions/handoffs.ts .pi/agent/extensions/recovery-policy.ts .pi/agent/extensions/recovery-runtime.ts .pi/agent/extensions/queue-runner.ts
```

### Key Evidence
- output:

```

```

## 2. queue-runner unit tests
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.BYxZzTCT2o/queue-runner-runtime && node --import tsx --test tests/extension-units/queue-runner.test.ts
```

### Key Evidence
- output:

```
✔ queue runner exposes run_next_queue_job and preserves run_queue_once as a compatibility alias (13.845125ms)
✔ queue runner no-ops when the queue is empty (4.215ms)
✔ queue runner no-ops when the queue is paused (3.636833ms)
✔ queue runner starts one eligible queued build job with linked task, packet, and initial handoff (7.266125ms)
✔ queue runner does not start a new job while the active linked task is still non-terminal (8.990125ms)
✔ queue runner finalizes an active running job when its linked task reaches done (7.518375ms)
✔ queue runner finalizes a running job as blocked when its linked task becomes blocked and clears activeJobId (6.482ms)
✔ queue runner compensates safely when queue activation succeeds but linked task start fails (5.806ms)
✔ queue runner blocks jobs without acceptance criteria and starts the next eligible job (4.283541ms)
✔ queue runner blocks unsupported budget and stop_conditions controls instead of silently ignoring them (4.40375ms)
✔ queue runner selects the next queued job deterministically by existing order within the same priority (4.059583ms)
✔ queue runner finalizes failed jobs with a bounded recovery recommendation (5.747125ms)
ℹ tests 12
ℹ suites 0
ℹ pass 12
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 887.61775
```

## 3. queue-runner validator and docs wiring
- Status: PASS

### Command
```bash
python3 /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.BYxZzTCT2o/check_3_queue_runner_wiring.py
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
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.BYxZzTCT2o/queue-runner-runtime && pi --no-session --no-extensions -e /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.BYxZzTCT2o/queue-runner-runtime/.pi/agent/extensions/till-done.ts -e /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.BYxZzTCT2o/queue-runner-runtime/.pi/agent/extensions/harness-routing.ts -e /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.BYxZzTCT2o/queue-runner-runtime/.pi/agent/extensions/team-activation.ts -e /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.BYxZzTCT2o/queue-runner-runtime/.pi/agent/extensions/task-packets.ts -e /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.BYxZzTCT2o/queue-runner-runtime/.pi/agent/extensions/handoffs.ts -e /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.BYxZzTCT2o/queue-runner-runtime/.pi/agent/extensions/recovery-policy.ts -e /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.BYxZzTCT2o/queue-runner-runtime/.pi/agent/extensions/recovery-runtime.ts -e /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.BYxZzTCT2o/queue-runner-runtime/.pi/agent/extensions/queue-runner.ts --mode json "Use run_next_queue_job and report the returned action in one sentence."
```

### Key Evidence
- live probe not run because --skip-live was requested

## Final Decision
- Overall status: PASS
- Failed checks: 0
- Summary JSON: /Users/subhajlimanond/dev/ma-code-harness-032/reports/validation/2026-04-21_queue-runner-validation-script.json
