# Automated Validation Report — Handoffs

- Date: 2026-04-29
- Generated at: 2026-04-29T10:28:43+0700
- Repo root: /Users/subhajlimanond/dev/ma-code
- Pi binary: pi
- Python binary: python3
- Live probe enabled: no
- Temporary root: /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.GH3DOXIMiI

## Summary Table

| Check | Status | Notes |
|---|---|---|
| 1. helper-level handoff generation | PASS | Deterministic helper-level handoff generation checks passed. |
| 2. handoff schema and policy sanity | PASS | Handoff schema and policy sanity checks passed. |
| 3. handoffs extension TypeScript compile | PASS | handoffs.ts compiled successfully with its extension dependencies. |
| 4. live generate_handoff tool probe | SKIP | Live probe skipped by default to avoid unnecessary provider-backed validation spend. |

## 1. helper-level handoff generation
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.GH3DOXIMiI/handoff-runtime && npx tsx /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.GH3DOXIMiI/check_1_helper_generation.mts
```

### Key Evidence
- helper checks passed for all required HARNESS-022 handoff types plus invalid role-pair rejection
- sample output:

```json
{
  "buildHandoffId": "handoff-build-to-worker-packet-backend-worker-harness-022-task-022-build-build-lead-backend-worker",
  "workerHandoffId": "handoff-worker-to-quality-packet-backend-worker-harness-022-task-022-build-backend-worker-quality-lead",
  "reviewerHandoffId": "handoff-quality-to-reviewer-packet-backend-worker-harness-022-task-022-build-quality-lead-reviewer-worker",
  "validatorHandoffId": "handoff-quality-to-validator-packet-backend-worker-harness-022-task-022-build-quality-lead-validator-worker",
  "recoveryHandoffId": "handoff-recovery-to-orchestrator-or-lead-packet-recovery-worker-harness-022-none-analyze--recovery-worker-orchestrator",
  "mismatchError": "Error: quality_to_reviewer does not allow toRole validator_worker.",
  "missingValidationQuestionsError": "Error: validationQuestions is required for this handoff type."
}
```

## 2. handoff schema and policy sanity
- Status: PASS

### Command
```bash
python3 - <<'PY'
import json
from pathlib import Path
root = Path(r'/Users/subhajlimanond/dev/ma-code')
schema = json.loads((root / '.pi/agent/state/schemas/handoff.schema.json').read_text())
policy = json.loads((root / '.pi/agent/handoffs/handoff-policy.json').read_text())
required = set(schema['required'])
expected = {'version','handoffId','handoffType','sourcePacketId','sourceGoalId','fromRole','toRole','requiredHeaders','preservedPacket','details'}
missing = sorted(expected - required)
if missing:
    raise SystemExit(f'missing handoff schema required keys: {missing}')
rules = set(policy['handoff_rules'].keys())
expected_rules = {'build_to_worker','worker_to_quality','quality_to_reviewer','quality_to_validator','recovery_to_orchestrator_or_lead'}
if rules != expected_rules:
    raise SystemExit(f'unexpected handoff rule set: {sorted(rules)}')
for key, rule in policy['handoff_rules'].items():
    if not rule['required_headers']:
        raise SystemExit(f'{key} must define required headers')
    if 'required_packet_fields' not in rule:
        raise SystemExit(f'{key} must define required_packet_fields')
if '## Validation Questions' not in policy['handoff_rules']['quality_to_validator']['required_headers']:
    raise SystemExit('quality_to_validator must require Validation Questions header')
if 'migration_path_note' not in policy['handoff_rules']['recovery_to_orchestrator_or_lead']['required_detail_fields']:
    raise SystemExit('recovery handoff must require migration_path_note detail field')
print('handoff-schema-policy-ok')
PY
```

### Key Evidence
- schema required fields include the bounded HARNESS-045 handoff-completeness contract
- handoff policy covers all required role transitions plus stronger packet/detail completeness rules
- output:

```
handoff-schema-policy-ok
```

## 3. handoffs extension TypeScript compile
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.GH3DOXIMiI/handoff-runtime && npx tsc --noEmit --allowImportingTsExtensions --skipLibCheck --moduleResolution nodenext --module nodenext --target es2022 --lib es2022,dom --types node src/harness-routing.ts src/team-activation.ts src/task-packets.ts src/handoffs.ts
```

### Key Evidence
- compile result: `PASS`

## 4. live generate_handoff tool probe
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
- Summary JSON: /Users/subhajlimanond/dev/ma-code/reports/validation/2026-04-29_handoffs-validation-script.json
