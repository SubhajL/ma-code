# Automated Validation Report — Extension Unit Tests

- Date: 2026-04-20
- Generated at: 2026-04-20T16:51:58+0700
- Repo root: /Users/subhajlimanond/dev/ma-code-worktrees/harness-037-extension-unit-tests
- Node binary: node
- npm binary: npm
- Temporary root: /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.Y5XE0QpUJi

## Summary Table

| Check | Status | Notes |
|---|---|---|
| 1. safe-bash runtime guard unit tests | PASS | safe-bash protected-path, hard-block, warn-level, and allow-path unit tests passed. |
| 2. till-done task-discipline unit tests | PASS | till-done mutation blocking, validation gate, lighter docs path, and active-task allow-path tests passed. |
| 3. routing/team/packet/handoff helper unit tests | PASS | routing, team activation, task packet, and handoff helper unit tests passed. |

## 1. safe-bash runtime guard unit tests
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.dHt8vo3tA4/unit-runtime && node --import tsx --test tests/extension-units/safe-bash.test.ts
```

### Key Evidence
- output:

```
✔ safe-bash blocks protected write paths (5.240459ms)
✔ safe-bash blocks hard-dangerous bash commands (1.11825ms)
✔ safe-bash blocks warn-level commands in non-interactive mode (1.184792ms)
✔ safe-bash allows safe non-mutating bash commands (0.781917ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 852.682458
```

## 2. till-done task-discipline unit tests
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.dHt8vo3tA4/unit-runtime && node --import tsx --test tests/extension-units/till-done.test.ts
```

### Key Evidence
- output:

```
✔ till-done blocks mutation without an active runnable task (5.3795ms)
✔ implementation tasks cannot complete without validation (5.816125ms)
✔ docs tasks can use lighter review-backed validation and complete (4.244416ms)
✔ active runnable tasks allow write/edit mutation path (2.004667ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 586.084375
```

## 3. routing/team/packet/handoff helper unit tests
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.dHt8vo3tA4/unit-runtime && node --import tsx --test tests/extension-units/orchestration-helpers.test.ts
```

### Key Evidence
- output:

```
✔ harness-routing resolves backend budget pressure to mini model (5.385209ms)
✔ team-activation resolves a planning-first path for ambiguous mixed work (2.739167ms)
✔ task-packets generates a valid packet from real policies (1.84925ms)
✔ handoffs preserve packet structure for worker-to-quality flow (1.12425ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 239.185292
```

## Final Decision
- Overall status: PASS
- Failed checks: 0
- Summary JSON: /Users/subhajlimanond/dev/ma-code-worktrees/harness-037-extension-unit-tests/reports/validation/2026-04-20_extension-unit-tests-validation-script.json
| 1. safe-bash runtime guard unit tests | PASS | safe-bash protected-path, hard-block, warn-level, and allow-path unit tests passed. |
| 2. till-done task-discipline unit tests | PASS | till-done mutation blocking, validation gate, lighter docs path, and active-task allow-path tests passed. |
| 3. routing/team/packet/handoff helper unit tests | PASS | routing, team activation, task packet, and handoff helper unit tests passed. |

## 1. safe-bash runtime guard unit tests
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.Y5XE0QpUJi/unit-runtime && node --import tsx --test tests/extension-units/safe-bash.test.ts
```

### Key Evidence
- output:

```
✔ safe-bash blocks protected write paths (5.496917ms)
✔ safe-bash blocks hard-dangerous bash commands (1.183834ms)
✔ safe-bash blocks warn-level commands in non-interactive mode (1.197083ms)
✔ safe-bash allows safe non-mutating bash commands (0.701958ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 842.952583
```

## 2. till-done task-discipline unit tests
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.Y5XE0QpUJi/unit-runtime && node --import tsx --test tests/extension-units/till-done.test.ts
```

### Key Evidence
- output:

```
✔ till-done blocks mutation without an active runnable task (7.023834ms)
✔ implementation tasks cannot complete without validation (5.06375ms)
✔ docs tasks can use lighter review-backed validation and complete (5.106708ms)
✔ active runnable tasks allow write/edit mutation path (2.239541ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 584.651417
```

## 3. routing/team/packet/handoff helper unit tests
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.Y5XE0QpUJi/unit-runtime && node --import tsx --test tests/extension-units/orchestration-helpers.test.ts
```

### Key Evidence
- output:

```
✔ harness-routing resolves backend budget pressure to mini model (3.410667ms)
✔ team-activation resolves a planning-first path for ambiguous mixed work (3.026541ms)
✔ task-packets generates a valid packet from real policies (1.883ms)
✔ handoffs preserve packet structure for worker-to-quality flow (1.391166ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 244.902083
```

## Final Decision
- Overall status: PASS
- Failed checks: 0
- Summary JSON: /Users/subhajlimanond/dev/ma-code-worktrees/harness-037-extension-unit-tests/reports/validation/2026-04-20_extension-unit-tests-validation-script.json
