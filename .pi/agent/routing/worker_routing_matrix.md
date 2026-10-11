# Worker-by-Worker Routing Matrix — GPT-5.5 Default / Opus Frontend / Spark Backend

> Internal harness routing reference. These are verified Pi-runnable IDs, not display-name placeholders.

| Role | Default Provider | Default Model | Default Thinking | Allowed Overrides | Budget Guidance |
|---|---|---|---|---|---|
| orchestrator | openai-codex | gpt-5.5 | high | openai-codex/gpt-5.3-codex-spark; anthropic/claude-opus-4-7; anthropic/claude-sonnet-4-6 | high |
| planning_lead | openai-codex | gpt-5.5 | high | openai-codex/gpt-5.3-codex-spark; anthropic/claude-opus-4-7; anthropic/claude-sonnet-4-6 | high |
| build_lead | openai-codex | gpt-5.5 | high | openai-codex/gpt-5.3-codex-spark; anthropic/claude-opus-4-7; anthropic/claude-sonnet-4-6 | medium |
| quality_lead | openai-codex | gpt-5.5 | high | openai-codex/gpt-5.3-codex-spark; anthropic/claude-opus-4-7; anthropic/claude-sonnet-4-6 | high |
| research_worker | openai-codex | gpt-5.5 | high | openai-codex/gpt-5.3-codex-spark; anthropic/claude-opus-4-7; anthropic/claude-sonnet-4-6 | low |
| frontend_worker | anthropic | claude-opus-4-7 | high | openai-codex/gpt-5.3-codex-spark; openai-codex/gpt-5.5; anthropic/claude-sonnet-4-6 | medium |
| backend_worker | openai-codex | gpt-5.3-codex-spark | high | openai-codex/gpt-5.5; anthropic/claude-sonnet-4-6; anthropic/claude-opus-4-7 | medium-high |
| infra_worker | openai-codex | gpt-5.3-codex-spark | high | openai-codex/gpt-5.5; anthropic/claude-sonnet-4-6; anthropic/claude-opus-4-7 | high |
| reviewer_worker | openai-codex | gpt-5.5 | high | openai-codex/gpt-5.3-codex-spark; anthropic/claude-opus-4-7; anthropic/claude-sonnet-4-6 | high |
| validator_worker | openai-codex | gpt-5.5 | high | openai-codex/gpt-5.3-codex-spark; anthropic/claude-opus-4-7; anthropic/claude-sonnet-4-6 | high |
| docs_worker | openai-codex | gpt-5.5 | high | openai-codex/gpt-5.3-codex-spark; anthropic/claude-opus-4-7; anthropic/claude-sonnet-4-6 | low |
| recovery_worker | openai-codex | gpt-5.5 | high | openai-codex/gpt-5.3-codex-spark; anthropic/claude-opus-4-7; anthropic/claude-sonnet-4-6 | high |

## Notes
- `frontend_worker` uses `anthropic/claude-opus-4-7` with high thinking.
- `backend_worker` and `infra_worker` use `openai-codex/gpt-5.3-codex-spark` with high thinking.
- g-check/reviewer and subsequent default non-coding roles use `openai-codex/gpt-5.5` with high thinking.
- Exact enforcement lives in `.pi/agent/models.json`; this table is a human-readable mirror.
