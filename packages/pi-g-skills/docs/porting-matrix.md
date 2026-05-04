# Codex `g-*` to Pi Porting Matrix

## Preserved
- Original skill names:
  - `g-planning`
  - `g-coding`
  - `g-check`
  - `g-review`
  - `g-create`
  - `g-submit`
- Auggie-first discovery with fast fallback
- TDD-first workflow
- RED/GREEN evidence discipline
- Wiring verification
- Skeptical review / QCHECK
- Severity-ordered findings
- Architecture drift analysis for system reviews

## Pi-native global additions
- `g-grill`
  - bounded mutual-understanding and grill-style clarification
- `g-prd`
  - PRD synthesis from clarified goals and repo context
- `g-issues`
  - vertical-slice backlog/issue planning with HITL vs AFK classification
- `g-refactor`
  - deep-module refactor planning using seam/interface/deletion-test vocabulary

## Adapted
- Codex `.codex/coding-log.current` -> Pi-style `logs/CURRENT.md`
- Codex coding logs -> Pi-style paired logs:
  - `logs/coding/`
  - `reports/planning/`
- Graphite-centric create/submit assumptions -> bounded Pi-native Git/GitHub workflow with Graphite-first guidance only when `gt` is actually available and relevant
- Second-model routing -> Pi extension tool `second_model_plan`
- Auggie integration -> Pi extension tool `auggie_discover`
- Product-planning and deep-refactor ideas -> bounded Pi-native skills (`g-grill`, `g-prd`, `g-issues`, `g-refactor`) instead of copying external skill text wholesale

## Intentionally dropped
- Hard Graphite-only dependency
- Taskmaster-specific dependencies
- Repo-local multi-agent harness routing
- Queue/task runtime mutation model
- Generic second-model fallback lanes beyond Claude Opus 4.6

## Extension-only rules
These behaviors are enforced in runtime helpers rather than skill text alone:
- `auggie_discover` bounded subprocess execution and explicit fallback metadata
- `second_model_plan` restriction to Claude Opus 4.6 and explicit fallback to the main model
