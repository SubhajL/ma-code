# Auggie MCP Integration Contract

This document answers three questions for the current Pi harness:
- can Pi expose MCP-backed capabilities?
- what is the current state of this repo?
- how should Auggie be integrated into the harness?

## Short answer

### Can Pi expose MCP-backed capabilities?
Yes, but not as a built-in core feature.

Pi's own docs are explicit:
- the core philosophy says **"No MCP"** as a built-in feature
- Pi expects you to add that behavior through **extensions** and **custom tools**

So the practical answer is:
- **Pi core:** no built-in MCP layer
- **Pi extension system:** yes, it can host MCP-backed integrations

### Can this current repo expose custom tools now?
Yes.

This repo already uses project-local Pi extensions via:
- `.pi/settings.json`
- `extensions: ["agent/extensions"]`

And it already has working extensions under:
- `.pi/agent/extensions/safe-bash.ts`
- `.pi/agent/extensions/till-done.ts`

So the harness already has the correct extension path for adding an Auggie-backed tool.

### Is Auggie available in this current session right now?
No.

In this session, no MCP/Auggie tool is exposed.
That means Auggie is currently a **design target**, not a live tool in this harness.

## Evidence from Pi docs
Relevant Pi documentation points:
- `README.md` says:
  - **"No MCP. Build CLI tools with READMEs, or build an extension that adds MCP support."**
- `README.md` and `docs/extensions.md` say extensions can:
  - register custom tools
  - intercept lifecycle events
  - register commands
  - add UI
  - integrate external systems
- `docs/extensions.md` shows:
  - `pi.registerTool(...)`
  - `pi.registerCommand(...)`
  - `pi.exec(...)`
  - dynamic tool registration at runtime
- `docs/sdk.md` shows Pi can also be embedded and customized programmatically, but the simplest fit for this repo is still a project-local extension

## Current repo state
Current relevant project wiring:
- `.pi/settings.json` enables project-local extensions from `agent/extensions`
- `.pi/agent/extensions/till-done.ts` already registers a custom tool: `task_update`
- `.pi/agent/extensions/safe-bash.ts` already intercepts built-in tool calls

Implication:
- this repo already supports adding another extension-based tool
- the clean place for Auggie integration is another extension under `.pi/agent/extensions/`

## Recommended integration shape

### Primary recommendation
Implement Auggie as a **Pi extension-backed custom tool**.

Recommended file:
- `.pi/agent/extensions/auggie-discovery.ts`

Current implementation target:
- custom tool: `auggie_discover`
- command: `/auggie-status`

Recommended exported behavior:
- register a custom tool for semantic codebase discovery
- register a status/debug command for operator inspection
- add prompt metadata so the model knows when to use it

### Why this shape fits
This repo already uses:
- extension-based runtime controls
- project-local Pi configuration
- file-backed harness docs and evidence

So Auggie should fit the same pattern instead of introducing a separate parallel integration style.

## Recommended tool contract

### Tool name
Recommended tool name:
- `auggie_discover`

Alternative acceptable names:
- `auggie_search`
- `codebase_discover`

Prefer `auggie_discover` because it is explicit and maps directly to the external capability.

### Tool purpose
The tool should provide:
- semantic codebase discovery
- relevant file/path suggestions
- existing pattern summaries
- likely entry points / wiring locations

It should not mutate files.
It is a read/discovery tool.

### Tool input
Recommended version 1 input shape:

```json
{
  "question": "Where is task lifecycle implemented and what code paths update task state?",
  "maxResults": 8,
  "timeoutMs": 2000
}
```

Recommended fields:
- `question`: required natural-language discovery request
- `maxResults`: optional cap for returned findings
- `timeoutMs`: optional bounded timeout, defaulting to a small safe value

### Tool output
Recommended version 1 output shape:
- short semantic summary
- relevant files
- likely symbols / components
- discovered patterns
- confidence / fallback metadata when possible

Suggested content structure:
- `summary`
- `files`
- `patterns`
- `notes`

The LLM-facing `content` should remain compact.
Detailed raw provider payloads should not be dumped into context.

## Fallback contract
This is the most important behavioral rule.

### Required policy
The harness should follow this sequence:
1. try Auggie first
2. bound the attempt tightly
3. if Auggie is unavailable, errors, or times out, fall back immediately to local discovery tools
4. record which path was used when it matters to planning or validation evidence

### Local fallback means
- `read`
- `grep` / `rg`
- `find`
- direct targeted file inspection

### Timeout rule
Recommended default:
- `timeoutMs = 2000`

Reason:
- long semantic-search stalls are worse than a quick fallback
- discovery is helpful, but it must not block the harness

### Failure semantics
If Auggie fails, the tool should return a compact response indicating:
- Auggie was unavailable / timed out / errored
- local fallback should be used

Do not hide the failure.
Do not pretend semantic results were returned if they were not.

## Runtime behavior contract

### Non-mutating behavior
The Auggie tool must be non-mutating.
It should not:
- edit files
- write task state
- change runtime state
- trigger autonomous execution on its own

### Safe external-call behavior
If the extension talks to an MCP server, subprocess, or HTTP bridge, it should:
- use a short timeout
- sanitize arguments
- return compact summaries
- avoid streaming huge raw payloads into model context

### Prompt behavior
The tool should be discoverable by the model via:
- `promptSnippet`
- optional `promptGuidelines`

Recommended prompt guidance:
- use this tool for semantic repo discovery before broad local searching when available
- if the tool result indicates fallback, continue with local file inspection

## Extension command
Recommended command:
- `/auggie-status`

Purpose:
- show whether Auggie is configured
- show recent availability status
- show the configured timeout
- help the operator debug why semantic search is or is not being used

### Configuration surface
Current expected environment variables:
- `AUGGIE_DISCOVERY_URL` for an HTTP bridge
- `AUGGIE_DISCOVERY_COMMAND` for a local command bridge that reads JSON from stdin
- `AUGGIE_DISCOVERY_TIMEOUT_MS` for default timeout override
- `AUGGIE_CLI_COMMAND` for the local `auggie` binary when a repo-local bridge script wraps it

Practical repo-local setup:
- `AUGGIE_DISCOVERY_COMMAND='python3 /Users/subhajlimanond/dev/ma-code/.pi/agent/extensions/bin/auggie-discovery-bridge.py'`

Current implementation note:
- if the env vars are not set, the extension can auto-detect the repo-local bridge script and common local `auggie` CLI paths
- explicit env configuration is still allowed as an override

Note:
- Codex MCP config such as `auggie --mcp` confirms Auggie is installed, but MCP stdio is not the same contract as this extension's one-shot command mode.
- Use a small bridge script when reusing an existing local Auggie install.

## Suggested implementation approaches

### Option A — Extension talks directly to local MCP bridge or process
Good when:
- Auggie is available via a local process or CLI wrapper
- you control the execution environment

Pattern:
- Pi extension -> `pi.exec(...)` / local client -> Auggie bridge -> compact result

### Option B — Extension talks to a local HTTP service that fronts Auggie
Good when:
- an existing local service already wraps Auggie
- you want simpler timeout/error handling in the Pi extension

Pattern:
- Pi extension -> HTTP call with short timeout -> compact semantic result

### Option C — SDK-hosted embedding layer
Good when:
- you are building a custom host application around Pi
- you want deeper programmatic orchestration

Not recommended as the first move for this repo.
The extension path is simpler and matches the current architecture.

## Recommended first implementation plan
1. add `.pi/agent/extensions/auggie-discovery.ts`
2. register a non-mutating custom tool: `auggie_discover`
3. set a default 2-second timeout
4. return compact summaries only
5. optionally add `/auggie-status`
6. update role prompts/docs to reference the live tool once it exists
7. add bounded validation for:
   - success path
   - timeout path
   - fallback-indicated path

## Validation expectations
Once implemented, validate at least:
- tool appears in Pi session tool list
- successful Auggie call returns compact semantic findings
- timeout returns explicit fallback signal
- failure path does not crash the session
- the model can proceed with local fallback after Auggie failure

## Current conclusion
- **Pi can support Auggie integration through extensions and custom tools**
- **this repo is already structurally ready for that**
- **Auggie is not currently live in this harness**
- **the right next implementation is an extension-backed discovery tool with strict fallback behavior**
