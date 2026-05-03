# Discovery Policy

Canonical discovery policy: `.pi/agent/docs/discovery_policy.md`

## Purpose

This policy chooses the smallest credible discovery path for a task before planning, implementation, review, or validation. It is a documentation and prompt-wiring surface only; it does not change runtime behavior.

## Selection order

1. Use Auggie first for bounded repo-local semantic discovery when the question benefits from codebase-level context and Auggie is available within the requested time/size bounds.
2. Use Graphify for broad repo/corpus structure discovery when a precomputed or bounded local graph helps with architecture, drift, dependency, or curated local research-corpus questions.
3. Use local read/rg/find for exact verification, narrow file inspection, static checks, and fallback when provider-backed or indexed discovery is unavailable, stale, too broad, or unnecessary.
4. Use Exa for current external web information, recent documentation, release notes, or third-party research that is not present in the repo.

## Tool boundaries

### Auggie
- Best for semantic repo discovery and locating likely entry points.
- Keep questions bounded and switch immediately to local inspection if unavailable, over budget, or inconclusive.
- Do not treat Auggie summaries as sufficient proof without direct file verification for changed surfaces.

### Graphify
- Best for broad local repository/corpus shape, architecture review, dependency exploration, and curated local research material.
- Optional only: Graphify is not required for narrow implementation tasks.
- Follow `.pi/agent/docs/graphify_adapter.md` and `.pi/agent/docs/graphify_discovery_research.md` for safety, artifacts, confidence, and freshness notes.
- Graphify is not a live web-search replacement for Exa.

### local read/rg/find
- Best for exact evidence, narrow diffs, static wiring checks, and validation of claims from other discovery tools.
- Prefer local inspection when the target files or strings are already known.
- Use it as the immediate fallback when Auggie, Graphify, or Exa are unavailable or unnecessary.

### Exa
- Best for live external web search, current upstream docs, release notes, and recent ecosystem information.
- Do not use Exa for secrets, private repo facts, or claims that can be verified directly in local files.
- Record source URLs or enough citation detail when Exa materially affects a decision.

## Evidence expectations

- Record which discovery path was used when it affects planning, validation, or risk.
- Cross-check provider/indexed summaries with local file evidence before implementation or completion claims.
- Prefer the cheapest local proof that answers the question; use provider-backed discovery only when it adds necessary context.

## Non-goals

- No runtime selector helper is introduced by this policy.
- No new requirement that every task run every discovery tool.
- No change to queue, task, routing, or validation behavior.
