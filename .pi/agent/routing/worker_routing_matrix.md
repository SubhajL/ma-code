# Worker-by-Worker Routing Matrix — GPT-5.4 First

> Internal harness routing reference. These are verified Pi-runnable IDs, not display-name placeholders.

| Role | Default Provider | Default Model | Default Thinking | Allowed Overrides | Budget Guidance |
|---|---|---|---|---|---|
| orchestrator | openai-codex | gpt-5.4 | high | anthropic/claude-opus-4-5; anthropic/claude-sonnet-4-6 | high |
| planning_lead | openai-codex | gpt-5.4 | high | anthropic/claude-opus-4-5; anthropic/claude-sonnet-4-6 | high |
| build_lead | openai-codex | gpt-5.4 | medium | anthropic/claude-sonnet-4-6; anthropic/claude-opus-4-5 | medium-high |
| quality_lead | openai-codex | gpt-5.4 | high | anthropic/claude-opus-4-5; anthropic/claude-sonnet-4-6 | high |
| research_worker | openai-codex | gpt-5.4-mini | low | openai-codex/gpt-5.4; anthropic/claude-sonnet-4-6 | low |
| frontend_worker | openai-codex | gpt-5.4 | medium | anthropic/claude-sonnet-4-6; anthropic/claude-opus-4-5 | medium |
| backend_worker | openai-codex | gpt-5.4 | medium | anthropic/claude-sonnet-4-6; anthropic/claude-opus-4-5 | medium-high |
| infra_worker | openai-codex | gpt-5.4 | high | anthropic/claude-opus-4-5; anthropic/claude-sonnet-4-6 | high |
| reviewer_worker | openai-codex | gpt-5.4 | high | anthropic/claude-opus-4-5; anthropic/claude-sonnet-4-6 | high |
| validator_worker | openai-codex | gpt-5.4 | high | anthropic/claude-opus-4-5; anthropic/claude-sonnet-4-6 | high |
| docs_worker | openai-codex | gpt-5.4-mini | low | openai-codex/gpt-5.4; anthropic/claude-sonnet-4-6 | low |
| recovery_worker | openai-codex | gpt-5.4 | high | anthropic/claude-opus-4-5; anthropic/claude-sonnet-4-6 | high |
