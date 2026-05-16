# Automated Validation Report — Harness Executable Routing

- Date: 2026-05-17
- Generated at: 2026-05-17T06:41:52+0700
- Repo root: /Users/subhajlimanond/dev/ma-code
- Pi binary: pi
- Python binary: python3
- Live probe enabled: no
- Temporary root: /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.k3UCw7EqUa

## Summary Table

| Check | Status | Notes |
|---|---|---|
| 1. helper-level harness route resolution | PASS | Deterministic helper-level route checks passed, including Phase 7 screen/frontend/backend phase lanes. |
| 2. harness-routing extension TypeScript compile | PASS | harness-routing.ts compiled successfully. |
| 3. phase-lane harness-routing unit tests | PASS | Phase-lane harness-routing unit tests passed. |
| 4. live resolve_harness_route tool probe | SKIP | Live probe skipped by default to avoid unnecessary provider-backed validation spend. |

## 1. helper-level harness route resolution
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.k3UCw7EqUa/route-runtime && npx tsx /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.k3UCw7EqUa/check_1_helper_resolution.mts
```

### Key Evidence
- helper checks passed for default, do-not-downgrade, budget override, stronger override, fallback, explicit override, and Phase 7 screen/frontend/backend phase lanes
- sample output:

```json
[
  {
    "name": "planning default",
    "selectedModelId": "openai-codex/gpt-5.5",
    "source": "default",
    "thinking": "high",
    "phaseLane": null,
    "phaseRoutingSource": "none",
    "requestedModelVerificationStatus": null,
    "blockedAdjustments": []
  },
  {
    "name": "critical role not downgraded",
    "selectedModelId": "openai-codex/gpt-5.5",
    "source": "default",
    "thinking": "high",
    "phaseLane": null,
    "phaseRoutingSource": "none",
    "requestedModelVerificationStatus": null,
    "blockedAdjustments": [
      "orchestrator is blocked from budget_pressure adjustments by routing policy.",
      "orchestrator is not eligible for budget_pressure adjustments; kept openai-codex/gpt-5.5."
    ]
  },
  {
    "name": "backend budget override",
    "selectedModelId": "github-copilot/gpt-5.4-mini",
    "source": "budget_override",
    "thinking": "low",
    "phaseLane": null,
    "phaseRoutingSource": "none",
    "requestedModelVerificationStatus": null,
    "blockedAdjustments": []
  },
  {
    "name": "build lead budget override",
    "selectedModelId": "github-copilot/gpt-5.4-mini",
    "source": "budget_override",
    "thinking": "low",
    "phaseLane": null,
    "phaseRoutingSource": "none",
    "requestedModelVerificationStatus": null,
    "blockedAdjustments": []
  },
  {
    "name": "frontend harder task stronger override",
    "selectedModelId": "openai-codex/gpt-5.5",
    "source": "stronger_override",
    "thinking": "xhigh",
    "phaseLane": null,
    "phaseRoutingSource": "none",
    "requestedModelVerificationStatus": null,
    "blockedAdjustments": []
  },
  {
    "name": "provider failure fallback",
    "selectedModelId": "openai-codex/gpt-5.5",
    "source": "fallback",
    "thinking": "high",
    "phaseLane": null,
    "phaseRoutingSource": "none",
    "requestedModelVerificationStatus": null,
    "blockedAdjustments": []
  },
  {
    "name": "explicit allowed override",
    "selectedModelId": "anthropic/claude-opus-4-5",
    "source": "explicit_override",
    "thinking": "high",
    "phaseLane": null,
    "phaseRoutingSource": "none",
    "requestedModelVerificationStatus": null,
    "blockedAdjustments": []
  },
  {
    "name": "screen phase fallback",
    "selectedModelId": "openai-codex/gpt-5.5",
    "source": "phase_profile",
    "thinking": "high",
    "phaseLane": "screen_design",
    "phaseRoutingSource": "verified_model",
    "requestedModelVerificationStatus": "verified",
    "blockedAdjustments": []
  },
  {
    "name": "frontend phase fallback",
    "selectedModelId": "openai-codex/gpt-5.3-codex-spark",
    "source": "phase_profile",
    "thinking": "high",
    "phaseLane": "frontend_implementation",
    "phaseRoutingSource": "verified_model",
    "requestedModelVerificationStatus": "verified",
    "blockedAdjustments": []
  },
  {
    "name": "backend phase fallback",
    "selectedModelId": "openai-codex/gpt-5.3-codex-spark",
    "source": "phase_profile",
    "thinking": "high",
    "phaseLane": "backend_implementation",
    "phaseRoutingSource": "verified_model",
    "requestedModelVerificationStatus": "verified",
    "blockedAdjustments": []
  }
]
```

## 2. harness-routing extension TypeScript compile
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.k3UCw7EqUa/route-runtime && npx tsc --noEmit --skipLibCheck --moduleResolution nodenext --module nodenext --target es2022 --lib es2022,dom --types node src/harness-routing.ts
```

### Key Evidence
- compile result: `PASS`

## 3. phase-lane harness-routing unit tests
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.k3UCw7EqUa/route-runtime && npx tsx --test tests/extension-units/harness-routing.test.ts
```

### Key Evidence
- unit tests covered unverified fallback, verified activation, unavailable fallback, unknown lane rejection, role-only compatibility

## 4. live resolve_harness_route tool probe
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
- Summary JSON: /Users/subhajlimanond/dev/ma-code/reports/validation/2026-05-17_harness-routing-validation-script.json
