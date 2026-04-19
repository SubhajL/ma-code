# Second Model Planning Contract

This document defines the intended contract for second-model planning in the Pi harness.

## Purpose
The goal is to improve planning quality for medium- and high-risk work by:
- soliciting a second planning pass from another model
- having that second pass critique the draft plan
- returning one unified planning artifact

This is not mandatory for every task.
It is a bounded planning aid.

## Current implementation shape
Recommended extension file:
- `.pi/agent/extensions/second-model-planning.ts`

Recommended tool name:
- `second_model_plan`

## Intended use
Use this tool when:
- the task is medium- or high-risk
- the plan affects multiple files or domains
- runtime behavior, schemas, or validation flow may change
- a second planning opinion is worth the cost and latency

Do not require it for:
- trivial docs-only edits
- tiny low-risk changes
- situations where no second model is available

## Tool contract
Inputs should include:
- `goal`
- optional `contextSummary`
- optional `primaryPlan`
- optional `constraints`
- optional `preferredModels`
- optional `timeoutMs`

Outputs should include either:
- a second-model review plus unified plan, or
- a clear fallback response saying no eligible secondary model was available

## Model selection rule
Preferred secondary lanes:
1. explicit preferred models passed by the caller
2. Anthropic planning models, starting with `anthropic/claude-opus-4-6`
3. repo-local planning overrides from `.pi/agent/models.json`
4. preferred GitHub Copilot lanes when available
5. operator-local hints from `~/.codex/config.toml` when present, such as a configured Gemini MCP lane
6. a small bounded set of practical auto-fallback lanes such as Google Gemini or `openai-codex/gpt-5.4-mini`

This is intentionally operator-friendly rather than strictly Anthropic-only.
It should still remain bounded and transparent.

The selected model should not be the same as the current active model if an alternative exists.

## Fallback rule
If no eligible second model is available, or the second-model run fails, the tool must:
- return a compact fallback response
- preserve the primary plan if one was provided
- make the fallback explicit instead of pretending cross-model synthesis happened

## Isolation rule
The second-model run should be isolated from mutating tools.
Recommended subprocess posture:
- `--no-session`
- `--no-extensions`
- read-only tools only

This avoids recursion and accidental mutation during planning.

## Planning role rule
`planning_lead` should:
- use `second_model_plan` for medium- or high-risk planning when available
- keep going with single-model planning when fallback occurs
- record whether cross-model synthesis was used

## Success definition
This feature is successful when:
- a second model can be solicited safely when available
- the unified plan is returned in a stable shape
- fallback is explicit and non-disruptive when no second model is available
