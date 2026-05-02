# Graphify Discovery and Research

This document defines the current harness policy for Graphify-style knowledge-graph discovery.
The repo now includes a bounded runtime Graphify adapter plus a canonical validator, but Graphify remains optional discovery evidence rather than a default implementation dependency.

## Core policy
- Graphify is an optional discovery fallback, not a required harness dependency.
- Graphify is not a live web-search replacement for Exa.
- Graphify should be run by research/system-analysis lanes and consumed by planning lanes.
- Do not auto-install Graphify from harness prompts, validators, or workers.
- Do not enable Graphify watch mode, hooks, MCP servers, Neo4j push, or other long-running/side-effect modes by default.
- Treat Graphify reports as discovery evidence, not as authoritative proof.

## When Graphify fits
Use Graphify only when the task benefits from broad structural/corpus discovery, such as:
- unfamiliar or large codebases
- architecture or module relationship discovery
- existing-code PRD planning
- refactor candidate discovery
- curated local research corpora containing docs, papers, diagrams, or saved web material
- repeated questions over the same local corpus

Avoid Graphify when:
- a narrow `read`/`rg`/`find` inspection is sufficient
- live web search or recent external information is needed
- the corpus may contain secrets, private customer data, `.env*`, or protected runtime state
- the task is already in a bounded implementation lane

## Current runtime surface
- policy and role guidance: `.pi/agent/docs/graphify_discovery_research.md`
- runtime adapter: `.pi/agent/extensions/graphify-adapter.ts`
- operator/runtime reference: `.pi/agent/docs/graphify_adapter.md`
- canonical validator: `scripts/validate-graphify-discovery.sh`
- package alias: `npm run validate:graphify-discovery`

## Discovery order
For codebase discovery:
1. use Auggie first when available and bounded
2. use Graphify only when installed, useful for broad/system discovery, and allowed by scope; prefer the bounded `graphify_adapter` path over ad hoc CLI usage
3. fall back to local inspection with `read`, `rg`, `find`, and targeted file review

For research:
1. use Exa for live web search
2. use Graphify for curated local research corpora after source material is captured locally
3. use local docs or direct file inspection when provider-backed search is unnecessary

## Role ownership
- `research_worker` owns Graphify execution or report inspection when a system-analysis pass is needed.
- `planning_lead` consumes Graphify findings and must verify important claims before turning them into plans or task packets.
- `reviewer_worker` may use Graphify reports as architecture-review input, but should distinguish confirmed, inferred, and ambiguous relationships.
- `validator_worker` should challenge Graphify-derived claims when they affect acceptance, wiring, or completion proof.
- frontend/backend workers should normally consume scoped findings rather than run broad Graphify discovery during implementation.

## Evidence requirements
When Graphify informs planning, record:
- path or corpus scanned
- graph/report path if available
- generated-at time or commit/source reference if known
- whether findings are direct, inferred, or ambiguous
- which claims were verified by direct file inspection

## Artifact safety
- Keep Graphify artifacts out of normal source diffs unless explicitly requested.
- Use the ignored managed artifact directory `.pi/agent/artifacts/graphify/<task-id>/` when the runtime adapter is used.
- Do not copy Graphify runtime output into harness package/bootstrap artifacts by default.
- Do not scan protected paths such as `.env*`, `.git/`, `node_modules/`, or `.pi/agent/state/runtime/`.

## Phase boundary
The current repo-local harness already implements a bounded `graphify_adapter` tool with `status`, `scan`, and `query` actions plus canonical validation in `scripts/validate-graphify-discovery.sh`.
Future work, if needed, should extend that bounded surface additively rather than reintroducing unbounded watch/hooks/MCP behavior.
