# Automated Validation Report — Recovery Policy

- Date: 2026-04-20
- Generated at: 2026-04-20T18:33:03+0700
- Repo root: /Users/subhajlimanond/dev/ma-code-worktrees/harness-018-029-recovery-policy
- Pi binary: pi
- Python binary: python3
- Live probe enabled: no
- Temporary root: /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.Zu5I2jAMKF

## Summary Table

| Check | Status | Notes |
|---|---|---|
| 1. helper-level recovery policy resolution | PASS | Deterministic helper-level recovery classification and retry eligibility checks passed. |
| 2. recovery-policy extension TypeScript compile | PASS | recovery-policy.ts compiled successfully. |
| 3. live resolve_recovery_policy tool probe | SKIP | Live probe skipped by default to avoid unnecessary provider-backed validation spend. |

## 1. helper-level recovery policy resolution
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.Zu5I2jAMKF/recovery-runtime && npx tsx /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.Zu5I2jAMKF/check_1_helper_resolution.mts
```

### Key Evidence
- helper checks passed for provider-failure, ambiguity, validation-failure, and budget-exhaustion cases
- sample output:

```json
[
  {
    "name": "research provider failure prefers stronger same-provider model",
    "failureClass": "provider_failure",
    "recommendedAction": "retry_stronger_model",
    "strongerModelCandidate": "openai-codex/gpt-5.4",
    "providerSwitchCandidate": null,
    "escalationRequired": false
  },
  {
    "name": "backend provider failure switches provider when same-provider stronger unavailable",
    "failureClass": "provider_failure",
    "recommendedAction": "switch_provider",
    "strongerModelCandidate": null,
    "providerSwitchCandidate": "anthropic/claude-sonnet-4-6",
    "escalationRequired": false
  },
  {
    "name": "ambiguous requirement escalates immediately",
    "failureClass": "ambiguity_failure",
    "recommendedAction": "escalate",
    "strongerModelCandidate": null,
    "providerSwitchCandidate": null,
    "escalationRequired": true
  },
  {
    "name": "validation failure allows same-lane retry when budget remains",
    "failureClass": "validation_failure",
    "recommendedAction": "retry_same_lane",
    "strongerModelCandidate": "anthropic/claude-sonnet-4-6",
    "providerSwitchCandidate": null,
    "escalationRequired": false
  },
  {
    "name": "provider retry budget exhaustion escalates",
    "failureClass": "provider_failure",
    "recommendedAction": "escalate",
    "strongerModelCandidate": null,
    "providerSwitchCandidate": null,
    "escalationRequired": true
  }
]
```

## 2. recovery-policy extension TypeScript compile
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.Zu5I2jAMKF/recovery-runtime && npx tsc --noEmit --skipLibCheck --allowImportingTsExtensions --moduleResolution nodenext --module nodenext --target es2022 --lib es2022,dom --types node src/harness-routing.ts src/recovery-policy.ts
```

### Key Evidence
- compile result: `PASS`

## 3. live resolve_recovery_policy tool probe
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
- Summary JSON: reports/validation/2026-04-20_recovery-policy-validation-script.json
