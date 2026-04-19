# Auggie and Second-Model Usage

## Auggie discovery

### What I found in local Codex config
Your Codex config already declares an Auggie MCP server:
- `~/.codex/config.toml`
- `[mcp_servers."auggie-mcp"]`
- command: `auggie`
- args: `--mcp`

There is also a helper script at:
- `~/.codex/mcp/auggie-mcp.sh`

That helper is useful for Codex MCP, but it is **not directly compatible** with Pi's current `AUGGIE_DISCOVERY_COMMAND` mode, because Pi's repo-local extension expects a one-shot JSON-in/JSON-out command, while `auggie --mcp` starts a long-lived MCP stdio server.

### Repo-local fix
Use the repo-local bridge:
- `.pi/agent/extensions/bin/auggie-discovery-bridge.py`

It:
- reads the extension JSON request from stdin
- calls local `auggie` in read-only ask mode
- returns compact JSON back to the Pi extension
- recommends fallback when Auggie is unavailable, unauthenticated, or out of credits

### Recommended shell config
You no longer need shell config for the common local case.
`auggie_discover` now auto-detects the repo-local bridge script and common local `auggie` CLI paths.

Optional explicit overrides are still supported:

```bash
export AUGGIE_DISCOVERY_COMMAND='python3 /Users/subhajlimanond/dev/ma-code/.pi/agent/extensions/bin/auggie-discovery-bridge.py'
export AUGGIE_CLI_COMMAND='/opt/homebrew/bin/auggie'
```

Then test:

```bash
pi --no-session --no-extensions \
  -e ./.pi/agent/extensions/auggie-discovery.ts \
  --print \
  "Use the auggie_discover tool with question 'Where is task lifecycle implemented?' and answer in one sentence whether fallback was recommended."
```

### Current environment note
In the current local environment, Auggie CLI is installed, but the test response indicates the Augment account is out of credits. In that case the bridge still works, but it returns:
- `fallbackRecommended: true`
- a compact reason
- guidance to continue with local discovery

## Second-model planning

### Default behavior
`second_model_plan` now uses an operator-friendly bounded selection order:
1. explicit `preferredModels`
2. `anthropic/claude-opus-4-6`
3. repo-local planning overrides from `.pi/agent/models.json`
4. preferred GitHub Copilot lanes
5. local operator hints from `~/.codex/config.toml` when present, such as Gemini MCP configuration
6. compact fallback if no usable second lane works

In practice this means the tool can auto-detect a likely Google Gemini second lane in environments where `~/.codex/config.toml` already advertises Gemini support.

### Recommended usage
For medium- or high-risk planning:
- provide `goal`
- provide `contextSummary`
- provide `primaryPlan`
- optionally pass `preferredModels` if you know a working second lane

### Example
If you want to force a specific lane, you can still pass it explicitly:

```text
Use second_model_plan with:
- goal: add task semantics enforcement
- contextSummary: docs under .pi/agent/docs and runtime schema under .pi/agent/state/schemas/tasks.schema.json
- primaryPlan: inspect schema, compare docs, implement smallest enforcement path
- preferredModels: ["google/gemini-2.5-flash"]
```

### Fallback meaning
If the tool cannot obtain a usable second-model response, it returns:
- a clear fallback note
- the preserved primary plan when available
- no false claim that cross-model synthesis happened
