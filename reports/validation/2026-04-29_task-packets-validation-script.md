# Automated Validation Report — Task Packets

- Date: 2026-04-29
- Generated at: 2026-04-29T10:31:47+0700
- Repo root: /Users/subhajlimanond/dev/ma-code
- Pi binary: pi
- Python binary: python3
- Live probe enabled: no
- Temporary root: /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.r70vRZXudc

## Summary Table

| Check | Status | Notes |
|---|---|---|
| 1. helper-level task packet generation | PASS | Deterministic helper-level task packet generation checks passed. |
| 2. task packet schema and policy sanity | PASS | Schema and packet policy sanity checks passed. |
| 3. task-packets extension TypeScript compile | PASS | task-packets.ts compiled successfully with its extension dependencies. |
| 4. live generate_task_packet tool probe | SKIP | Live probe skipped by default to avoid unnecessary provider-backed validation spend. |

## 1. helper-level task packet generation
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.r70vRZXudc/packet-runtime && npx tsx /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.r70vRZXudc/check_1_helper_generation.mts
```

### Key Evidence
- helper checks passed for build packet generation, planning packet generation, explicit goal/non-goals/file-plan/expected-proof fields, protected defaults, rendered packet format, role/team mismatch rejection, missing boundary rejection, and completeness-shape rejection
- sample output:

```json
{
  "buildPacketId": "packet-backend-worker-harness-021-task-021-build-implement-packet-generation",
  "buildModelOverride": "openai-codex/gpt-5.4-mini",
  "planningPacketId": "packet-planning-lead-harness-021-none-clarify-packet-shape",
  "renderedHeading": "## Packet ID",
  "mismatchError": "Error: Assigned role reviewer_worker does not belong to team build.",
  "pathError": "Error: Task packet generation requires at least one allowed path or domain.",
  "completenessError": "Error: filesToInspect must not be empty."
}
```

## 2. task packet schema and policy sanity
- Status: PASS

### Command
```bash
python3 - <<'PY'
import json
from pathlib import Path
root = Path(r'/Users/subhajlimanond/dev/ma-code')
schema = json.loads((root / '.pi/agent/state/schemas/task-packet.schema.json').read_text())
policy = json.loads((root / '.pi/agent/packets/packet-policy.json').read_text())
required = set(schema['required'])
expected = {
    'version','packetId','source','assignedTeam','assignedRole','title','goal','scope','nonGoals','workType','domains',
    'discoverySummary','crossModelPlanningNote','filesToInspect','filesToModify','allowedPaths','disallowedPaths',
    'acceptanceCriteria','evidenceExpectations','validationExpectations','expectedProof','wiringChecks',
    'migrationPathNote','escalationInstructions','dependencies','modelOverride','routing'
}
missing = sorted(expected - required)
if missing:
    raise SystemExit(f'missing schema required keys: {missing}')
if '.env*' not in policy['defaults']['disallowed_paths']:
    raise SystemExit('packet policy must protect .env* by default')
if not policy['defaults']['non_goals']:
    raise SystemExit('packet policy defaults.non_goals must not be empty')
if not policy['defaults']['files_to_inspect']:
    raise SystemExit('packet policy defaults.files_to_inspect must not be empty')
if not policy['defaults']['expected_proof']:
    raise SystemExit('packet policy defaults.expected_proof must not be empty')
if not policy['defaults']['migration_path_note']:
    raise SystemExit('packet policy defaults.migration_path_note must not be empty')
if not policy['defaults']['evidence_expectations']:
    raise SystemExit('packet policy defaults.evidence_expectations must not be empty')
if set(policy['team_validation_expectations'].keys()) != {'planning','build','quality','recovery'}:
    raise SystemExit('packet policy team_validation_expectations must cover all teams')
print('schema-policy-ok')
PY
```

### Key Evidence
- schema required fields include the bounded HARNESS-044 planning-completeness packet contract
- packet policy protects default disallowed paths, explicit non-goals/file-plan/proof defaults, and all teams
- output:

```
schema-policy-ok
```

## 3. task-packets extension TypeScript compile
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.r70vRZXudc/packet-runtime && npx tsc --noEmit --allowImportingTsExtensions --skipLibCheck --moduleResolution nodenext --module nodenext --target es2022 --lib es2022,dom --types node src/harness-routing.ts src/team-activation.ts src/task-packets.ts
```

### Key Evidence
- compile result: `PASS`

## 4. live generate_task_packet tool probe
- Status: SKIP

### Command
```bash
- none
```

### Key Evidence
- run with `--include-live` when one bounded live wiring proof is needed

## Final Decision

- Overall status: PASS
- Failed checks: 0
- Summary JSON: /Users/subhajlimanond/dev/ma-code/reports/validation/2026-04-29_task-packets-validation-script.json
