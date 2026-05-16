# Routing Notes — GPT-5.5 Default / Spark Coding

## Executable routing source
- Machine-readable source: `.pi/agent/models.json`
- Executable resolver: `.pi/agent/extensions/harness-routing.ts`
- Validation script: `scripts/validate-harness-routing.sh`

## Default does not mean mandatory
A default model is the normal starting lane for a role.

Current policy:
- g-coding / implementation worker roles (`frontend_worker`, `backend_worker`, `infra_worker`) default to `openai-codex/gpt-5.3-codex-spark` with `high` thinking.
- g-check / reviewer roles and subsequent non-coding default roles default to `openai-codex/gpt-5.5` with `high` thinking.
- Phase lanes `frontend_implementation` and `backend_implementation` also select verified `openai-codex/gpt-5.3-codex-spark` with `high` thinking.
- Phase lane `screen_design` selects verified `openai-codex/gpt-5.5` with `high` thinking.

Override only when:
- the task is clearly simpler than usual
- the task is harder than usual
- a provider/model failed
- budget pressure is explicit
- recovery policy recommends a switch
- a human explicitly requests an allowed override

## Safety
- Do not route around role/task safety controls.
- Do not encode thinking level into `modelOverride` strings; use model id plus separate thinking policy.
- Keep routing changes covered by `tests/extension-units/harness-routing.test.ts` and `scripts/validate-harness-routing.sh`.
