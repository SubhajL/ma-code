# Automated Validation Report — Handoffs

- Date: 2026-04-19
- Generated at: 2026-04-19T18:54:45+0700
- Repo root: /Users/subhajlimanond/dev/ma-code-worktrees/harness-022-handoffs
- Pi binary: pi
- Python binary: python3
- Live probe enabled: yes
- Temporary root: /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.xoLWln2OtK

## Summary Table

| Check | Status | Notes |
|---|---|---|
| 1. helper-level handoff generation | PASS | Deterministic helper-level handoff generation checks passed. |
| 2. handoff schema and policy sanity | PASS | Handoff schema and policy sanity checks passed. |
| 3. handoffs extension TypeScript compile | PASS | handoffs.ts compiled successfully with its extension dependencies. |
| 4. live generate_handoff tool probe | SKIP | Live probe skipped because provider/model access was unavailable in this environment. |

## 1. helper-level handoff generation
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.xoLWln2OtK/handoff-runtime && npx tsx /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.xoLWln2OtK/check_1_helper_generation.mts
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
  "mismatchError": "Error: quality_to_reviewer does not allow toRole validator_worker."
}
```

## 2. handoff schema and policy sanity
- Status: PASS

### Command
```bash
python3 - <<'PY'
import json
from pathlib import Path
root = Path(r'/Users/subhajlimanond/dev/ma-code-worktrees/harness-022-handoffs')
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
print('handoff-schema-policy-ok')
PY
```

### Key Evidence
- schema required fields include the bounded HARNESS-022 handoff contract
- handoff policy covers all required role transitions
- output:

```
handoff-schema-policy-ok
```

## 3. handoffs extension TypeScript compile
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.xoLWln2OtK/handoff-runtime && npx tsc --noEmit --allowImportingTsExtensions --skipLibCheck --moduleResolution nodenext --module nodenext --target es2022 --lib es2022,dom --types node src/harness-routing.ts src/team-activation.ts src/task-packets.ts src/handoffs.ts
```

### Key Evidence
- compile result: `PASS`

## 4. live generate_handoff tool probe
- Status: SKIP

### Command
```bash
pi --no-session --no-extensions -e /Users/subhajlimanond/dev/ma-code-worktrees/harness-022-handoffs/.pi/agent/extensions/handoffs.ts -e /Users/subhajlimanond/dev/ma-code-worktrees/harness-022-handoffs/.pi/agent/extensions/task-packets.ts -e /Users/subhajlimanond/dev/ma-code-worktrees/harness-022-handoffs/.pi/agent/extensions/harness-routing.ts -e /Users/subhajlimanond/dev/ma-code-worktrees/harness-022-handoffs/.pi/agent/extensions/team-activation.ts --mode json "First use generate_task_packet for sourceGoalId harness-022, assignedTeam build, assignedRole backend_worker, title Implement handoff generator, scope Only add bounded handoff runtime logic, workType implementation, domains [backend], allowedPaths [.pi/agent/extensions/handoffs.ts], and acceptanceCriteria [handoff is generated]. Then use generate_handoff with handoffType build_to_worker, fromRole build_lead, toRole backend_worker, and that source packet. Finally report the handoff ID in one sentence."
```

### Key Evidence
- output indicated provider/model unavailability:

```
{"type":"session","version":3,"id":"019da597-df2c-77db-8b46-421550132609","timestamp":"2026-04-19T11:54:46.957Z","cwd":"/Users/subhajlimanond/dev/ma-code-worktrees/harness-022-handoffs"}
{"type":"agent_start"}
{"type":"turn_start"}
{"type":"message_start","message":{"role":"user","content":[{"type":"text","text":"First use generate_task_packet for sourceGoalId harness-022, assignedTeam build, assignedRole backend_worker, title Implement handoff generator, scope Only add bounded handoff runtime logic, workType implementation, domains [backend], allowedPaths [.pi/agent/extensions/handoffs.ts], and acceptanceCriteria [handoff is generated]. Then use generate_handoff with handoffType build_to_worker, fromRole build_lead, toRole backend_worker, and that source packet. Finally report the handoff ID in one sentence."}],"timestamp":1776599687060}}
{"type":"message_end","message":{"role":"user","content":[{"type":"text","text":"First use generate_task_packet for sourceGoalId harness-022, assignedTeam build, assignedRole backend_worker, title Implement handoff generator, scope Only add bounded handoff runtime logic, workType implementation, domains [backend], allowedPaths [.pi/agent/extensions/handoffs.ts], and acceptanceCriteria [handoff is generated]. Then use generate_handoff with handoffType build_to_worker, fromRole build_lead, toRole backend_worker, and that source packet. Finally report the handoff ID in one sentence."}],"timestamp":1776599687060}}
{"type":"message_start","message":{"role":"assistant","content":[],"api":"openai-codex-responses","provider":"openai-codex","model":"gpt-5.4","usage":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"totalTokens":0,"cost":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"total":0}},"stopReason":"error","timestamp":1776599687062,"errorMessage":"You have hit your ChatGPT usage limit (team plan). Try again in ~214 min."}}
{"type":"message_end","message":{"role":"assistant","content":[],"api":"openai-codex-responses","provider":"openai-codex","model":"gpt-5.4","usage":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"totalTokens":0,"cost":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"total":0}},"stopReason":"error","timestamp":1776599687062,"errorMessage":"You have hit your ChatGPT usage limit (team plan). Try again in ~214 min."}}
{"type":"turn_end","message":{"role":"assistant","content":[],"api":"openai-codex-responses","provider":"openai-codex","model":"gpt-5.4","usage":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"totalTokens":0,"cost":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"total":0}},"stopReason":"error","timestamp":1776599687062,"errorMessage":"You have hit your ChatGPT usage limit (team plan). Try again in ~214 min."},"toolResults":[]}
{"type":"agent_end","messages":[{"role":"user","content":[{"type":"text","text":"First use generate_task_packet for sourceGoalId harness-022, assignedTeam build, assignedRole backend_worker, title Implement handoff generator, scope Only add bounded handoff runtime logic, workType implementation, domains [backend], allowedPaths [.pi/agent/extensions/handoffs.ts], and acceptanceCriteria [handoff is generated]. Then use generate_handoff with handoffType build_to_worker, fromRole build_lead, toRole backend_worker, and that source packet. Finally report the handoff ID in one sentence."}],"timestamp":1776599687060},{"role":"assistant","content":[],"api":"openai-codex-responses","provider":"openai-codex","model":"gpt-5.4","usage":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"totalTokens":0,"cost":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"total":0}},"stopReason":"error","timestamp":1776599687062,"errorMessage":"You have hit your ChatGPT usage limit (team plan). Try again in ~214 min."}]}
```

## Final Decision

- Overall status: PASS
- Failed checks: 0
- Summary JSON: /Users/subhajlimanond/dev/ma-code-worktrees/harness-022-handoffs/reports/validation/2026-04-19_handoffs-validation-script.json
