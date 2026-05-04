# Graphify Final Runbook

## Purpose
- Give operators one final checklist for deciding when and how to use Graphify in this repo-local harness.
- Keep Graphify optional, bounded, and evidence-oriented.
- Make the safe path explicit from discovery decision through preflight, scan, query, direct verification, evidence recording, and cleanup.

## Graphify evidence lifecycle drift guard
Graphify evidence lifecycle drift guard: explicit research queue-session orchestration -> graphifyEvidence in packet/handoff -> task_update validator consumption.
This lifecycle is bounded: metadata is optional, there is no global mandatory Graphify, no Graphify CLI --watch, daemon, or background behavior, and source verification remains required.

## Preconditions
- Use the discovery policy first: Auggie remains preferred for bounded semantic repo discovery when available.
- Use Graphify only for broad repo/corpus structure discovery when local graph evidence is useful and scoped.
- Do not use Graphify as a live web-search replacement; use Exa or another current-information path for external/current facts.
- Do not auto-install Graphify from the harness. If the binary is missing, record the missing-binary status and continue with local `read` / `rg` / `find` fallback unless a human chooses to install it outside the harness.

## Final Operator Checklist

### 1. Confirm Graphify is optional and appropriate
- Confirm the task needs broad repo/corpus structure discovery rather than exact local verification.
- Confirm source scope is repo-local, non-sensitive, and no broader than needed.
- Confirm Graphify-derived claims will be treated as leads until direct source inspection verifies important facts.
- If the question needs current external information, stop and use Exa or another live-search path instead.

### 2. Run preflight before scan
- Use `graphify_adapter` with `action: "preflight"` before any scan.
- Confirm preflight reports:
  - source path stays inside the repo/worktree
  - output path stays under `.pi/agent/artifacts/graphify/<task-id>/`
  - file count is within the configured approval threshold or approval is explicit
  - forbidden background/side-effect flags are absent
  - `wouldRun: false` and `wouldCreateArtifacts: false`
  - a deterministic `preflightToken` is returned for the exact safe request attributes
- If preflight blocks, narrow scope or record the blocker; do not force a scan around the guard.

### 3. Run a bounded scan only after approval gates pass
- Run a scan only when preflight is acceptable, Graphify is installed, and the scan includes the matching `preflightToken` returned by preflight.
- Keep scans one-shot and bounded; do not enable watch, hook, MCP, Neo4j push, output override, semantic/deep/multimodal, URL, PDF, image, or video modes by default.
- For large corpus scans, require explicit human approval before setting `approvedLargeCorpus: true`.
- Generated output must remain under `.pi/agent/artifacts/graphify/<task-id>/`.
- If source path, output path, task id, purpose, file count, approval, threshold, or safe extra args change, rerun preflight and use the new token.

### 4. Check freshness/cadence before reuse
- Before broad planning, after structural changes, or before final validation, call `graphify_adapter` with `action: "freshness"`, the relevant `taskId`, and the closest `cadencePhase`.
- If freshness reports `missing_graph` or `missing_metadata`, run preflight then scan only when broad Graphify discovery is still warranted.
- If freshness reports `dirty_worktree`, treat the graph as potentially stale for uncommitted changes; use local verification and avoid rescanning for small implementation-loop edits.
- If freshness is `fresh` before final validation, query the graph for leads and directly verify important claims before acceptance.

### 5. Query and verify before planning or acceptance
- Query only managed Graphify artifacts created or intentionally provided for the task.
- Treat confidence levels conservatively:
  - `EXTRACTED` / confirmed: useful evidence, still verify when architecture or acceptance depends on it
  - `INFERRED`: lead only; verify by direct source inspection
  - `AMBIGUOUS`: requires direct source inspection before use
- Do not accept graph-only proof for code correctness, architecture decisions, or final validation.
- Graphify-backed acceptance cannot pass unless the latest relevant graph was queried or freshness/cadence was checked, and important claims were verified with direct source inspection.
- Record which direct files were inspected to verify any important Graphify-derived claim.

### 6. Record evidence and cleanup boundaries
- Record the discovery path in the planning/coding log:
  - Auggie attempt result
  - Graphify preflight/scan/query result when used
  - local fallback commands used for verification
- Record validation commands and reports, usually:
  - `bash scripts/validate-graphify-discovery.sh`
  - `bash scripts/check-repo-static.sh`
  - `bash scripts/check-foundation-extension-compile.sh` when runtime extension surfaces changed
- Do not commit generated Graphify artifacts.
- Do not commit generated validation reports unless the task explicitly asks for report artifacts in the diff.
- Keep unresolved risks visible, especially stale graph metadata, missing binary, large-corpus approval, or unverified inferred/ambiguous edges.

## Standard Commands

### Focused local validation
```bash
bash scripts/validate-graphify-discovery.sh
bash scripts/check-repo-static.sh
```

### Runtime compile validation after adapter changes
```bash
bash scripts/check-foundation-extension-compile.sh
```

### Optional explicit installed-CLI smoke
```bash
bash scripts/validate-graphify-discovery.sh --smoke
```

Use `--smoke` only when one bounded real-CLI proof is needed. Default validation must remain usable without installed Graphify.

## Completion Notes
- A Graphify task is complete only when the relevant task evidence includes changed files, validation output, what was done, and known gaps.
- Generated Graphify artifacts are discovery evidence, not source changes.
- The final decision should state whether Graphify was used as primary broad-structure discovery, fallback discovery, or not used.
