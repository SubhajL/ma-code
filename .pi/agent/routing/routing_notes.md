# Routing Notes — GPT-5.4 First

## Executable routing source
- Machine-readable source: `.pi/agent/models.json`
- Executable resolver: `.pi/agent/extensions/harness-routing.ts`
- Validation script: `scripts/validate-harness-routing.sh`

## Default does not mean mandatory
A default model is the normal starting lane for a role.

Override only when:
- the task is clearly simpler than usual
- the task is clearly harder than usual
- the provider is failing
- recovery recommends a different lane
- a human explicitly requests a permitted override

Executable override reasons now supported by policy:
- `task_simpler`
- `task_harder`
- `provider_failure`
- `budget_pressure`
- `recovery_recommendation`
- `human_override`

## Thinking discipline
- low = cheap, light, bounded
- medium = normal implementation
- high = architecture, ambiguity, validation, review, recovery

## Guardrail
Do not let random model switching become the debugging strategy.
Critical roles should not be casually downgraded under budget pressure.
Budget-sensitive downgrades should stay bounded to non-critical worker lanes that the machine-readable policy explicitly allows.
