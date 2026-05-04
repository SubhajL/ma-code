# Architecture Roadmap Alignment

This document is the canonical boundary map for the current Graphify and bounded-session slices. It prevents tactical helper work from being mistaken for broader autonomy or architecture completion.

## Architecture Boundary Map

- Tactical Graphify adapter support is bounded discovery infrastructure, not global architecture authority.
  - It provides status, preflight, bounded scan, freshness, and query surfaces for broad repo/corpus discovery.
  - It does not replace Auggie-first discovery, direct source inspection, or Exa for current external information.
- Runtime validation enforcement is implemented through task validation/completion gates, not through Graphify scans alone.
  - `till-done.ts` evaluates validation decisions and records evidence.
  - Graphify-derived claims still require freshness/query proof and direct source verification before acceptance.
- Policy-gated mandatory Graphify use is optional_default by default and scoped to Graphify-backed or architecture-review claims only when explicitly requested.
  - `required_for_graphify_backed_claims` and `required_for_architecture_review` are scoped policies, not a global dependency switch.
  - `disabled` remains an explicit non-blocking mode.
- Bounded watch/session mode means foreground queue-session execution with max steps, max runtime seconds, explicit task id or scope, visible logs, and no Graphify CLI --watch.
  - The implemented path is `scripts/harness-queue-session.ts` and `run_bounded_queue_session`.
  - It is not a daemon, hidden scheduler, background Graphify process, or unbounded watch loop.
- Future roadmap gaps remain explicit: no free-running queue daemon, no hidden scheduled loop, no global mandatory Graphify dependency, and no hands-free Phase I/Phase J autonomy claim.
  - Current work improves bounded operator ergonomics and validation confidence.
  - It does not complete broad team orchestration, long-running autonomy, UI polish, or global architecture governance.

## Layer Responsibilities

| Layer | Implemented responsibility | Boundary |
| --- | --- | --- |
| Graphify adapter | Optional broad-structure discovery and managed artifact safety | Not mandatory for all tasks; not live web search; not final proof without source verification |
| Graphify validation decision helper | Pure decision model for proof state and scoped policy | Does not mutate runtime state by itself |
| Runtime task validation | Enforces completion/validation gates and records evidence | Does not make Graphify globally required unless scoped policy/input requires it |
| Bounded queue session | Foreground bounded queue advancement with max step/runtime limits and visible triage | Not a daemon, watch mode, or hidden scheduled loop |
| Static checks | Keep docs/prompts/scripts aligned with boundary language | Do not prove runtime behavior alone; pair with targeted validators |

## Roadmap Interpretation

Current slices should be described as:
- tactical Graphify adapter support for broad discovery,
- runtime validation enforcement for Graphify-backed acceptance proof,
- optional policy-gated mandatory use for scoped claims,
- bounded foreground queue-session operation,
- and explicit future roadmap gaps.

They should not be described as:
- Graphify being globally required,
- Graphify scan output being sufficient final validation by itself,
- a Graphify or queue daemon,
- hidden watch/session automation,
- or completion of hands-free long-running autonomy.

## Validation Contract

Cheap static drift checks live in `scripts/check-repo-static.sh` and require this boundary language plus references from the main operator/architecture docs. Runtime behavior remains covered by targeted validators such as:
- `bash scripts/validate-graphify-discovery.sh`
- `bash scripts/validate-queue-runner.sh --skip-live`
- `bash scripts/validate-core-workflows.sh`
- `npx --yes tsx --test tests/integration/queue-session.test.ts`
