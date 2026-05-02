# Graphify CLI Compatibility Fix Plan

## Goal
- Make the Graphify adapter compatible with installed `graphifyy 0.6.4` while preserving managed artifacts and sensitive-path exclusions.

## Plan
1. Update tests first to expect real CLI-compatible `graphify update <path>` invocation.
2. Require the adapter to run Graphify from the managed artifact directory and pass a sanitized managed source snapshot, not the raw repo root.
3. Support query from either direct `graph.json` or real CLI `graphify-out/graph.json` under the managed artifact directory.
4. Update docs and coding log.
5. Run focused compile/unit/integration/static validation and g-check.

## Non-goals
- Do not enable watch/hooks/MCP/Neo4j/deep/semantic/multimodal/URL modes.
- Do not auto-install or alter Graphify installation.
- Do not commit generated Graphify artifacts.
