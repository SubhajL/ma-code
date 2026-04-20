# Automated Validation Report — Same Runtime Bridge

- Date: 2026-04-20
- Generated at: 2026-04-20T07:10:37+0700
- Repo root: /Users/subhajlimanond/dev/ma-code-worktrees/same-runtime-bridge
- Pi binary: pi
- Python binary: python3
- Live probe enabled: yes
- Temporary root: /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.KbTg5yCv6Y

## Summary Table

| Check | Status | Notes |
|---|---|---|
| 1. helper-level model and auth-source logic | PASS | Helper-level model resolution and auth-source classification checks passed. |
| 2. same-runtime bridge TypeScript compile | PASS | same-runtime-bridge.ts compiled successfully. |
| 3. live same-runtime probe tool | SKIP | Live probe skipped because provider/model access was unavailable in this environment. |

## 1. helper-level model and auth-source logic
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.KbTg5yCv6Y/runtime && npx tsx ./check_1_helper_logic.mts
```

### Key Evidence
- helper checks passed for current-model inheritance, explicit override, oauth/api_key/runtime-class/missing auth classification
- sample output:

```json
{
  "inheritedModel": "gpt-5.4",
  "overrideModel": "gpt-5.4-mini",
  "oauthSource": "auth_storage_oauth",
  "apiKeySource": "auth_storage_api_key",
  "runtimeSource": "configured_external_or_runtime",
  "missingSource": "missing"
}
```

## 2. same-runtime bridge TypeScript compile
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.KbTg5yCv6Y/runtime && npx tsc --noEmit --allowImportingTsExtensions --skipLibCheck --moduleResolution nodenext --module nodenext --target es2022 --lib es2022,dom --types node src/same-runtime-bridge.ts
```

### Key Evidence
- compile result: `PASS`

## 3. live same-runtime probe tool
- Status: SKIP

### Command
```bash
pi --no-session --no-extensions -e /Users/subhajlimanond/dev/ma-code-worktrees/same-runtime-bridge/.pi/agent/extensions/same-runtime-bridge.ts --mode json "Use run_same_runtime_probe with prompt Reply exactly PROBE_OK, toolProfile none, and includeProjectExtensions false. Then report the selected model ID and response text in one sentence."
```

### Key Evidence
- output indicated provider/model unavailability:

```
{"type":"session","version":3,"id":"019da839-95f2-728c-abb5-63673317c798","timestamp":"2026-04-20T00:10:39.475Z","cwd":"/Users/subhajlimanond/dev/ma-code-worktrees/same-runtime-bridge"}
{"type":"agent_start"}
{"type":"turn_start"}
{"type":"message_start","message":{"role":"user","content":[{"type":"text","text":"Use run_same_runtime_probe with prompt Reply exactly PROBE_OK, toolProfile none, and includeProjectExtensions false. Then report the selected model ID and response text in one sentence."}],"timestamp":1776643839519}}
{"type":"message_end","message":{"role":"user","content":[{"type":"text","text":"Use run_same_runtime_probe with prompt Reply exactly PROBE_OK, toolProfile none, and includeProjectExtensions false. Then report the selected model ID and response text in one sentence."}],"timestamp":1776643839519}}
{"type":"message_start","message":{"role":"assistant","content":[],"api":"openai-codex-responses","provider":"openai-codex","model":"gpt-5.4","usage":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"totalTokens":0,"cost":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"total":0}},"stopReason":"error","timestamp":1776643839522,"errorMessage":"You have hit your ChatGPT usage limit (team plan). Try again in ~406 min."}}
{"type":"message_end","message":{"role":"assistant","content":[],"api":"openai-codex-responses","provider":"openai-codex","model":"gpt-5.4","usage":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"totalTokens":0,"cost":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"total":0}},"stopReason":"error","timestamp":1776643839522,"errorMessage":"You have hit your ChatGPT usage limit (team plan). Try again in ~406 min."}}
{"type":"turn_end","message":{"role":"assistant","content":[],"api":"openai-codex-responses","provider":"openai-codex","model":"gpt-5.4","usage":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"totalTokens":0,"cost":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"total":0}},"stopReason":"error","timestamp":1776643839522,"errorMessage":"You have hit your ChatGPT usage limit (team plan). Try again in ~406 min."},"toolResults":[]}
{"type":"agent_end","messages":[{"role":"user","content":[{"type":"text","text":"Use run_same_runtime_probe with prompt Reply exactly PROBE_OK, toolProfile none, and includeProjectExtensions false. Then report the selected model ID and response text in one sentence."}],"timestamp":1776643839519},{"role":"assistant","content":[],"api":"openai-codex-responses","provider":"openai-codex","model":"gpt-5.4","usage":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"totalTokens":0,"cost":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"total":0}},"stopReason":"error","timestamp":1776643839522,"errorMessage":"You have hit your ChatGPT usage limit (team plan). Try again in ~406 min."}]}
```

## Final Decision

- Overall status: PASS
- Failed checks: 0
- Summary JSON: /Users/subhajlimanond/dev/ma-code-worktrees/same-runtime-bridge/reports/validation/2026-04-20_same-runtime-bridge-validation-script.json
