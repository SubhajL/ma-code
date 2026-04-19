# Automated Validation Report — Harness Executable Routing

- Date: 2026-04-19
- Generated at: 2026-04-19T14:26:58+0700
- Repo root: /Users/subhajlimanond/dev/ma-code
- Pi binary: pi
- Python binary: python3
- Live probe enabled: no
- Temporary root: /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.svwMJeVkqp

## Summary Table

| Check | Status | Notes |
|---|---|---|
| 1. helper-level harness route resolution | PASS | Deterministic helper-level route checks passed. |
| 2. harness-routing extension TypeScript compile | PASS | harness-routing.ts compiled successfully. |
| 3. live resolve_harness_route tool probe | SKIP | Live probe skipped by default to avoid unnecessary provider-backed validation spend. |

## 1. helper-level harness route resolution
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.svwMJeVkqp/route-runtime && npx tsx /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.svwMJeVkqp/check_1_helper_resolution.mts
```

### Key Evidence
- helper checks passed for default, do-not-downgrade, budget override, stronger override, fallback, and explicit override
- sample output:

```json
[
  {
    "name": "planning default",
    "selectedModelId": "openai-codex/gpt-5.4",
    "source": "default",
    "blockedAdjustments": []
  },
  {
    "name": "critical role not downgraded",
    "selectedModelId": "openai-codex/gpt-5.4",
    "source": "default",
    "blockedAdjustments": [
      "orchestrator is blocked from budget_pressure adjustments by routing policy.",
      "orchestrator is not eligible for budget_pressure adjustments; kept openai-codex/gpt-5.4."
    ]
  },
  {
    "name": "backend budget override",
    "selectedModelId": "openai-codex/gpt-5.4-mini",
    "source": "budget_override",
    "blockedAdjustments": []
  },
  {
    "name": "frontend harder task stronger override",
    "selectedModelId": "anthropic/claude-sonnet-4-6",
    "source": "stronger_override",
    "blockedAdjustments": []
  },
  {
    "name": "provider failure fallback",
    "selectedModelId": "anthropic/claude-sonnet-4-6",
    "source": "fallback",
    "blockedAdjustments": []
  },
  {
    "name": "explicit allowed override",
    "selectedModelId": "anthropic/claude-opus-4-5",
    "source": "explicit_override",
    "blockedAdjustments": []
  }
]
```

## 2. harness-routing extension TypeScript compile
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.svwMJeVkqp/route-runtime && npx tsc --noEmit --skipLibCheck --moduleResolution nodenext --module nodenext --target es2022 --lib es2022,dom --types node src/harness-routing.ts
```

### Key Evidence
- compile result: `PASS`

## 3. live resolve_harness_route tool probe
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
- Summary JSON: /Users/subhajlimanond/dev/ma-code/reports/validation/2026-04-19_harness-routing-validation-script.json
