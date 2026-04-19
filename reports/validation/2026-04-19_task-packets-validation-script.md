# Automated Validation Report — Task Packets

- Date: 2026-04-19
- Generated at: 2026-04-19T18:15:53+0700
- Repo root: /Users/subhajlimanond/dev/ma-code-worktrees/harness-021-task-packets
- Pi binary: pi
- Python binary: python3
- Live probe enabled: yes
- Temporary root: /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.HRI6oP6DSX

## Summary Table

| Check | Status | Notes |
|---|---|---|
| 1. helper-level task packet generation | PASS | Deterministic helper-level task packet generation checks passed. |
| 2. task packet schema and policy sanity | PASS | Schema and packet policy sanity checks passed. |
| 3. task-packets extension TypeScript compile | PASS | task-packets.ts compiled successfully with its extension dependencies. |
| 4. live generate_task_packet tool probe | PASS | Live probe observed generate_task_packet and the expected packet ID prefix. |

## 1. helper-level task packet generation
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.HRI6oP6DSX/packet-runtime && npx tsx /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.HRI6oP6DSX/check_1_helper_generation.mts
```

### Key Evidence
- helper checks passed for build packet generation, planning packet generation, protected defaults, rendered packet format, role/team mismatch rejection, and missing boundary rejection
- sample output:

```json
{
  "buildPacketId": "packet-backend-worker-harness-021-task-021-build-implement-packet-generation",
  "buildModelOverride": "openai-codex/gpt-5.4-mini",
  "planningPacketId": "packet-planning-lead-harness-021-none-clarify-packet-shape",
  "renderedHeading": "## Packet ID",
  "mismatchError": "Error: Assigned role reviewer_worker does not belong to team build.",
  "pathError": "Error: Task packet generation requires at least one allowed path or domain."
}
```

## 2. task packet schema and policy sanity
- Status: PASS

### Command
```bash
python3 - <<'PY'
import json
from pathlib import Path
root = Path(r'/Users/subhajlimanond/dev/ma-code-worktrees/harness-021-task-packets')
schema = json.loads((root / '.pi/agent/state/schemas/task-packet.schema.json').read_text())
policy = json.loads((root / '.pi/agent/packets/packet-policy.json').read_text())
required = set(schema['required'])
expected = {
    'version','packetId','source','assignedTeam','assignedRole','title','scope','workType','domains',
    'discoverySummary','crossModelPlanningNote','allowedPaths','disallowedPaths','acceptanceCriteria',
    'evidenceExpectations','validationExpectations','wiringChecks','escalationInstructions','dependencies',
    'modelOverride','routing'
}
missing = sorted(expected - required)
if missing:
    raise SystemExit(f'missing schema required keys: {missing}')
if '.env*' not in policy['defaults']['disallowed_paths']:
    raise SystemExit('packet policy must protect .env* by default')
if not policy['defaults']['evidence_expectations']:
    raise SystemExit('packet policy defaults.evidence_expectations must not be empty')
if set(policy['team_validation_expectations'].keys()) != {'planning','build','quality','recovery'}:
    raise SystemExit('packet policy team_validation_expectations must cover all teams')
print('schema-policy-ok')
PY
```

### Key Evidence
- schema required fields include the bounded HARNESS-021 packet contract
- packet policy protects default disallowed paths and covers all teams
- output:

```
schema-policy-ok
```

## 3. task-packets extension TypeScript compile
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.HRI6oP6DSX/packet-runtime && npx tsc --noEmit --allowImportingTsExtensions --skipLibCheck --moduleResolution nodenext --module nodenext --target es2022 --lib es2022,dom --types node src/harness-routing.ts src/team-activation.ts src/task-packets.ts
```

### Key Evidence
- compile result: `PASS`

## 4. live generate_task_packet tool probe
- Status: PASS

### Command
```bash
pi --no-session --no-extensions -e /Users/subhajlimanond/dev/ma-code-worktrees/harness-021-task-packets/.pi/agent/extensions/task-packets.ts -e /Users/subhajlimanond/dev/ma-code-worktrees/harness-021-task-packets/.pi/agent/extensions/harness-routing.ts -e /Users/subhajlimanond/dev/ma-code-worktrees/harness-021-task-packets/.pi/agent/extensions/team-activation.ts --mode json "Use generate_task_packet for sourceGoalId harness-021, assignedTeam build, assignedRole backend_worker, title Implement packet generator, scope Only add bounded packet runtime logic, workType implementation, domains [backend], allowedPaths [.pi/agent/extensions/task-packets.ts], and acceptanceCriteria [packet is generated]. Then report the packet ID in one sentence."
```

### Key Evidence
- tool call observed: `generate_task_packet`
- expected packet ID prefix found: `packet-backend-worker-harness-021`

## Final Decision

- Overall status: PASS
- Failed checks: 0
- Summary JSON: /Users/subhajlimanond/dev/ma-code-worktrees/harness-021-task-packets/reports/validation/2026-04-19_task-packets-validation-script.json
