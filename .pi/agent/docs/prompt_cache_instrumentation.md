# Prompt cache instrumentation

**Status:** Tier 0 deliverable. Documents the gap and provides a tested utility ready to plug in.

## Summary

`@mariozechner/pi-ai` already implements Anthropic prompt caching for this harness — it applies `cache_control` to system messages, tool schemas, and the last user message, and surfaces `cacheRead`/`cacheWrite` token counts via its `Usage` type. The harness does not consume that telemetry today, so we cannot report cache hit rate or measure the cost savings.

This document captures what is true upstream, what is missing locally, and what to add on each side once a hook lands.

## What pi-ai already does

Confirmed at `node_modules/@mariozechner/pi-ai/dist/providers/anthropic.js`:

- `cache_control` blocks are applied to system, tool definitions, and the final user message.
- The streaming event handler reads `cache_read_input_tokens` and `cache_creation_input_tokens` from the Anthropic message events and writes them to `output.usage.cacheRead` / `output.usage.cacheWrite`.
- The `Usage` interface (`node_modules/@mariozechner/pi-ai/dist/types.d.ts:111`) carries `input`, `output`, `cacheRead`, `cacheWrite`, `totalTokens`, and a `cost` breakdown.

So **the producer side is complete**. We do not need to enable caching; we need to capture what pi-ai already returns.

## What the harness does today

A grep for `cacheRead|cacheWrite|usage\.` across `.pi/agent/extensions/` and `scripts/` returns zero matches. There is no per-call interception of `AssistantMessage.usage` and no aggregation into `logs/harness-actions.jsonl` or anywhere else.

This is a *consumer-side* gap. We do not see provider call telemetry because pi-coding-agent's session loop does not expose a hook the harness can subscribe to.

## What this PR adds

`.pi/agent/extensions/cache-telemetry.ts` — two pure functions and their unit tests:

- `summarizeUsage(usage, { recordedAt, provider, model })` — normalizes a single pi-ai `Usage` object into a stable `CacheTelemetryRecord` (version: 1, with `cacheHitRate` precomputed from `cacheRead / (input + cacheRead)`).
- `aggregateCacheTelemetry(records)` — sums token counts and computes overall hit rate and total cost across multiple records.

These functions are testable in isolation and have no I/O. They are deliberately unwired today, because the upstream hook does not exist yet. The point is that when it does, the consumer side is ready and tested.

## Path to wiring it up

When pi-coding-agent exposes a per-call hook (or when the harness intercepts assistant messages in a session loop it owns), the integration is roughly two lines:

```ts
import { summarizeUsage } from "./cache-telemetry.ts";
// inside the response handler:
const record = summarizeUsage(message.usage, { provider: message.provider, model: message.model });
await appendFile("logs/harness-actions.jsonl", JSON.stringify({ event: "cache-telemetry", ...record }) + "\n");
```

Once that wiring lands, `harness:doctor` can grow a new check that reads recent telemetry records and warns if cache hit rate falls below a threshold (suggested: 0.5 over the last 100 calls on critical roles).

## Open questions for the upstream pi-coding-agent maintainers

1. Is there an extension hook for "a response just landed, here is the AssistantMessage"? If not, what is the right place to add one?
2. Should usage records carry the harness role (`orchestrator`, `frontend_worker`, etc.) so we can compute per-role cache hit rate? That requires propagating the active role from `harness-routing.ts` into the call site.
3. Should aggregation happen in-process (lightweight, no disk pressure) or via post-hoc log scanning (simpler, but requires log retention)?

These are upstream design questions; do not block on them. The local utility lands now so the harness side is ready.

## Why this is a Tier 0 item

The lead's review flagged prompt caching as a high-ROI but speculative win that needs measurement before design. This deliverable is the measurement plumbing. No model routing, no prompt restructuring, no premature optimization — just the tested consumer-side that flips on the moment a producer-side hook exists.
