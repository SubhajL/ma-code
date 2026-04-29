# Automated Validation Report — Extension Unit Tests

- Date: 2026-04-29
- Generated at: 2026-04-29T10:29:08+0700
- Repo root: /Users/subhajlimanond/dev/ma-code
- Node binary: node
- npm binary: npm
- Temporary root: /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.CNd6lm5lGs

## Summary Table

| Check | Status | Notes |
|---|---|---|
| 1. safe-bash runtime guard unit tests | PASS | safe-bash protected-path, hard-block, warn-level, and allow-path unit tests passed. |
| 2. till-done task-discipline unit tests | PASS | till-done mutation blocking, validation gate, lighter docs path, and active-task allow-path tests passed. |
| 3. routing/team/packet/handoff helper unit tests | PASS | routing, team activation, task packet, and handoff helper unit tests passed. |
| 4. queue-runner bounded step unit tests | PASS | queue-runner unit tests passed for empty/paused no-ops, deterministic single-job start/finalize, stop-condition enforcement for retries/runtime/failed validations/approval boundaries, unsupported-control blocking, compensation safety, and recovery reuse. |

## 1. safe-bash runtime guard unit tests
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.CNd6lm5lGs/unit-runtime && node --import tsx --test tests/extension-units/safe-bash.test.ts
```

### Key Evidence
- output:

```
✔ safe-bash blocks protected write paths (5.807042ms)
✔ safe-bash write on main with active task auto-branches and is allowed (2.048792ms)
✔ safe-bash write on main without active task stays blocked with clear reason (1.1475ms)
✔ safe-bash write on main with unexpected dirty tracked file stays blocked (1.192875ms)
✔ safe-bash write/edit target worktree branch is evaluated from target path directory (1.219ms)
✔ safe-bash touch on main auto-branches and is allowed (1.717208ms)
✔ safe-bash leading cd uses target worktree branch for mutation safety (1.593958ms)
✔ safe-bash leading cd to target main still remains blocked by main-branch protections (1.211375ms)
✔ safe-bash blocks cross-repo write target paths clearly (0.850667ms)
✔ safe-bash blocks leading cd into non-repo context clearly (1.061792ms)
✔ safe-bash git commit on main still blocks with branch guidance (1.016583ms)
✔ safe-bash blocks hard-dangerous bash commands (0.507833ms)
✔ safe-bash blocks warn-level commands in non-interactive mode (0.55075ms)
✔ safe-bash allows safe non-mutating bash commands (0.409834ms)
ℹ tests 14
ℹ suites 0
ℹ pass 14
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1189.85575
```

## 2. till-done task-discipline unit tests
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.CNd6lm5lGs/unit-runtime && node --import tsx --test tests/extension-units/till-done.test.ts
```

### Key Evidence
- output:

```
✔ till-done blocks mutation without an active runnable task (5.328ms)
✔ implementation tasks cannot complete without validation (5.466292ms)
✔ docs tasks can use lighter review-backed validation and complete (4.093917ms)
✔ active runnable tasks allow write/edit mutation path (2.468375ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 562.3055
```

## 3. routing/team/packet/handoff helper unit tests
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.CNd6lm5lGs/unit-runtime && node --import tsx --test tests/extension-units/orchestration-helpers.test.ts
```

### Key Evidence
- output:

```
✔ harness-routing resolves backend budget pressure to mini model with calibrated minimal thinking (4.38775ms)
✔ harness-routing keeps critical roles at high thinking under cost pressure (0.488167ms)
✔ harness-routing raises cheaper build-worker defaults back to high thinking for harder tasks (0.392875ms)
✔ harness-routing allows build lead budget pressure to use the mini override (0.286458ms)
✔ team-activation resolves a planning-first path for ambiguous mixed work (2.21525ms)
✔ task-packets generates a valid packet from real policies (1.716416ms)
✔ task-packets default planning-completeness fields remain explicit for bounded build work (0.76025ms)
✔ handoffs preserve stronger planning context for worker-to-quality flow (1.425584ms)
✔ quality-to-validator and recovery handoffs require stronger validation and migration structure (0.881834ms)
ℹ tests 9
ℹ suites 0
ℹ pass 9
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 235.443042
```

## 4. queue-runner bounded step unit tests
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.CNd6lm5lGs/unit-runtime && node --import tsx --test tests/extension-units/queue-runner.test.ts
```

### Key Evidence
- output:

```
✔ queue runner exposes run_next_queue_job and preserves run_queue_once as a compatibility alias (9.861583ms)
✔ queue runner no-ops when the queue is empty (3.587625ms)
✔ queue runner no-ops when the queue is paused (3.256958ms)
✔ operator inspect queue state summarizes queue and task status (6.982667ms)
✔ operator pause and resume controls gate queue pickup (6.422625ms)
✔ bounded queue session tool starts queued work and stops at the next waiting point (4.8825ms)
✔ bounded queue session can finalize visible terminal work and start the next queued job in one invocation (12.452ms)
✔ operator safe stop pauses queue and blocks the active linked task (5.484583ms)
✔ queue runner starts one eligible queued build job with linked task, packet, and initial handoff (4.323375ms)
✔ queue runner does not start a new job while the active linked task is still non-terminal (5.864542ms)
✔ queue runner finalizes an active running job when its linked task reaches done (6.603333ms)
✔ queue runner finalizes a running job as blocked when its linked task becomes blocked and clears activeJobId (6.429333ms)
✔ queue runner compensates safely when queue activation succeeds but linked task start fails (6.178917ms)
✔ queue runner blocks jobs without acceptance criteria and starts the next eligible job (4.305708ms)
✔ queue runner blocks unsupported budget fields and unsupported free-form stop_conditions but allows supported HARNESS-034 controls (4.502209ms)
✔ queue runner blocks queued approvalRequired jobs before start (4.939791ms)
✔ queue runner logs queued approval boundary blocks to the audit log (3.469208ms)
✔ queue runner fails queued retries that already exhausted maxRetries or maxFailedValidations before restart (18.442542ms)
✔ queue runner treats retryCount plus the current validation fail as exhausting maxFailedValidations before restart (7.259709ms)
✔ queue runner allows restart when a single current validation fail is still below maxFailedValidations (6.387791ms)
✔ queue runner coordinates queue and linked task stop when approval boundary is hit on an active running job (4.994084ms)
✔ queue runner coordinates queue and linked task failure when active runtime exceeds maxRuntimeMinutes (4.737292ms)
✔ queue runner selects the next queued job deterministically by existing order within the same priority (3.808833ms)
✔ queue runner finalizes failed jobs with a bounded recovery recommendation (5.260583ms)
ℹ tests 24
ℹ suites 0
ℹ pass 24
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 713.229583
```

## Final Decision
- Overall status: PASS
- Failed checks: 0
- Summary JSON: /Users/subhajlimanond/dev/ma-code/reports/validation/2026-04-29_extension-unit-tests-validation-script.json
