# Automated Validation Report — Extension Unit Tests

- Date: 2026-04-22
- Generated at: 2026-04-22T05:25:32+0700
- Repo root: /Users/subhajlimanond/dev/ma-code-harness-032
- Node binary: node
- npm binary: npm
- Temporary root: /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.pwcrN5Tuqq

## Summary Table

| Check | Status | Notes |
|---|---|---|
| 1. safe-bash runtime guard unit tests | PASS | safe-bash protected-path, hard-block, warn-level, and allow-path unit tests passed. |
| 2. till-done task-discipline unit tests | PASS | till-done mutation blocking, validation gate, lighter docs path, and active-task allow-path tests passed. |
| 3. routing/team/packet/handoff helper unit tests | PASS | routing, team activation, task packet, and handoff helper unit tests passed. |
| 4. queue-runner bounded step unit tests | PASS | queue-runner unit tests passed for empty/paused no-ops, deterministic single-job start/finalize, invalid-job and deferred-control blocking, compensation safety, and recovery reuse. |

## 1. safe-bash runtime guard unit tests
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.pwcrN5Tuqq/unit-runtime && node --import tsx --test tests/extension-units/safe-bash.test.ts
```

### Key Evidence
- output:

```
✔ safe-bash blocks protected write paths (6.027167ms)
✔ safe-bash blocks hard-dangerous bash commands (1.320417ms)
✔ safe-bash blocks warn-level commands in non-interactive mode (1.069667ms)
✔ safe-bash allows safe non-mutating bash commands (0.888416ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 798.129625
```

## 2. till-done task-discipline unit tests
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.pwcrN5Tuqq/unit-runtime && node --import tsx --test tests/extension-units/till-done.test.ts
```

### Key Evidence
- output:

```
✔ till-done blocks mutation without an active runnable task (5.849125ms)
✔ implementation tasks cannot complete without validation (6.084833ms)
✔ docs tasks can use lighter review-backed validation and complete (4.070792ms)
✔ active runnable tasks allow write/edit mutation path (1.894666ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 592.068791
```

## 3. routing/team/packet/handoff helper unit tests
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.pwcrN5Tuqq/unit-runtime && node --import tsx --test tests/extension-units/orchestration-helpers.test.ts
```

### Key Evidence
- output:

```
✔ harness-routing resolves backend budget pressure to mini model (3.310666ms)
✔ team-activation resolves a planning-first path for ambiguous mixed work (3.447541ms)
✔ task-packets generates a valid packet from real policies (1.859041ms)
✔ handoffs preserve packet structure for worker-to-quality flow (1.216417ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 233.147083
```

## 4. queue-runner bounded step unit tests
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.pwcrN5Tuqq/unit-runtime && node --import tsx --test tests/extension-units/queue-runner.test.ts
```

### Key Evidence
- output:

```
✔ queue runner exposes run_next_queue_job and preserves run_queue_once as a compatibility alias (18.848208ms)
✔ queue runner no-ops when the queue is empty (15.54475ms)
✔ queue runner no-ops when the queue is paused (3.652167ms)
✔ queue runner starts one eligible queued build job with linked task, packet, and initial handoff (6.41625ms)
✔ queue runner does not start a new job while the active linked task is still non-terminal (5.985959ms)
✔ queue runner finalizes an active running job when its linked task reaches done (7.7165ms)
✔ queue runner finalizes a running job as blocked when its linked task becomes blocked and clears activeJobId (6.944042ms)
✔ queue runner compensates safely when queue activation succeeds but linked task start fails (7.638542ms)
✔ queue runner blocks jobs without acceptance criteria and starts the next eligible job (13.776375ms)
✔ queue runner blocks unsupported budget and stop_conditions controls instead of silently ignoring them (17.323083ms)
✔ queue runner selects the next queued job deterministically by existing order within the same priority (4.544375ms)
✔ queue runner finalizes failed jobs with a bounded recovery recommendation (6.801083ms)
ℹ tests 12
ℹ suites 0
ℹ pass 12
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 681.289125
```

## Final Decision
- Overall status: PASS
- Failed checks: 0
- Summary JSON: /Users/subhajlimanond/dev/ma-code-harness-032/reports/validation/2026-04-22_extension-unit-tests-validation-script.json
