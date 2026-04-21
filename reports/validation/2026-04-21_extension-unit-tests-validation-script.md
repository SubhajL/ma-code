# Automated Validation Report — Extension Unit Tests

- Date: 2026-04-21
- Generated at: 2026-04-21T20:59:14+0700
- Repo root: /Users/subhajlimanond/dev/ma-code-harness-032
- Node binary: node
- npm binary: npm
- Temporary root: /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.P3hYg1cAE0

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
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.P3hYg1cAE0/unit-runtime && node --import tsx --test tests/extension-units/safe-bash.test.ts
```

### Key Evidence
- output:

```
✔ safe-bash blocks protected write paths (5.681ms)
✔ safe-bash blocks hard-dangerous bash commands (1.709917ms)
✔ safe-bash blocks warn-level commands in non-interactive mode (1.40375ms)
✔ safe-bash allows safe non-mutating bash commands (0.993583ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 920.459708
```

## 2. till-done task-discipline unit tests
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.P3hYg1cAE0/unit-runtime && node --import tsx --test tests/extension-units/till-done.test.ts
```

### Key Evidence
- output:

```
✔ till-done blocks mutation without an active runnable task (8.426083ms)
✔ implementation tasks cannot complete without validation (15.64825ms)
✔ docs tasks can use lighter review-backed validation and complete (13.527292ms)
✔ active runnable tasks allow write/edit mutation path (2.490833ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 688.619041
```

## 3. routing/team/packet/handoff helper unit tests
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.P3hYg1cAE0/unit-runtime && node --import tsx --test tests/extension-units/orchestration-helpers.test.ts
```

### Key Evidence
- output:

```
✔ harness-routing resolves backend budget pressure to mini model (3.853458ms)
✔ team-activation resolves a planning-first path for ambiguous mixed work (3.885583ms)
✔ task-packets generates a valid packet from real policies (1.903458ms)
✔ handoffs preserve packet structure for worker-to-quality flow (1.445375ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 248.040208
```

## 4. queue-runner bounded step unit tests
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.P3hYg1cAE0/unit-runtime && node --import tsx --test tests/extension-units/queue-runner.test.ts
```

### Key Evidence
- output:

```
✔ queue runner exposes run_next_queue_job and preserves run_queue_once as a compatibility alias (10.378209ms)
✔ queue runner no-ops when the queue is empty (4.015625ms)
✔ queue runner no-ops when the queue is paused (4.256666ms)
✔ queue runner starts one eligible queued build job with linked task, packet, and initial handoff (6.313375ms)
✔ queue runner does not start a new job while the active linked task is still non-terminal (6.288209ms)
✔ queue runner finalizes an active running job when its linked task reaches done (9.873166ms)
✔ queue runner finalizes a running job as blocked when its linked task becomes blocked and clears activeJobId (6.213125ms)
✔ queue runner compensates safely when queue activation succeeds but linked task start fails (9.564167ms)
✔ queue runner blocks jobs without acceptance criteria and starts the next eligible job (5.0275ms)
✔ queue runner blocks unsupported budget and stop_conditions controls instead of silently ignoring them (5.947792ms)
✔ queue runner selects the next queued job deterministically by existing order within the same priority (4.350125ms)
✔ queue runner finalizes failed jobs with a bounded recovery recommendation (7.085084ms)
ℹ tests 12
ℹ suites 0
ℹ pass 12
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 673.779958
```

## Final Decision
- Overall status: PASS
- Failed checks: 0
- Summary JSON: /Users/subhajlimanond/dev/ma-code-harness-032/reports/validation/2026-04-21_extension-unit-tests-validation-script.json
