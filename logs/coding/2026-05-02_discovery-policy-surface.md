# Coding Log — discovery-policy-surface

- Date: 2026-05-02
- Scope: canonical discovery policy doc and static/prompt/operator wiring
- Status: in_progress
- Branch: `split/discovery-policy-surface`
- Related planning log: `reports/planning/2026-05-02_discovery-policy-surface-plan.md`

## Task Group
- Add static enforcement and minimal documentation/prompt wiring for the canonical discovery policy surface.

## Files Investigated
- `AGENTS.md`
- `README.md`
- `logs/CURRENT.md`
- `logs/README.md`
- `scripts/check-repo-static.sh`
- `.pi/agent/prompts/roles/orchestrator.md`
- `.pi/agent/docs/operator_workflow.md`
- `.pi/agent/docs/file_map.md`
- `.pi/agent/docs/graphify_adapter.md`
- `.pi/agent/docs/graphify_discovery_research.md`

## Files Changed
- `scripts/check-repo-static.sh` — add static assertions for the policy doc, prompt/operator/file-map references, and active log pointers.
- `.pi/agent/docs/discovery_policy.md` — new canonical policy choosing among Auggie, Graphify, local read/rg/find, and Exa.
- `.pi/agent/prompts/roles/orchestrator.md` — point routing decisions at the canonical policy.
- `.pi/agent/docs/operator_workflow.md` — replace duplicated discovery bullets with policy reference plus concise rules.
- `.pi/agent/docs/file_map.md` — add the canonical discovery policy to discoverable docs.
- `README.md` — add related-docs entry for the policy.
- `logs/CURRENT.md` — point to this bounded log pair.
- `reports/planning/2026-05-02_discovery-policy-surface-plan.md` — plan for this slice.

## Runtime / Validation Evidence
- RED: `bash scripts/check-repo-static.sh` failed with `Missing required file: .pi/agent/docs/discovery_policy.md` after adding the static expectation only.

## Key Findings
- Auggie discovery was attempted first and returned credit-exhausted fallback guidance, so discovery continued with local reads/grep.
- Existing Graphify docs and operator workflow already contain useful pieces, but no single canonical selection policy existed.

## Decisions Made
- Keep this slice documentation/static-only.
- Defer runtime selector helpers until the policy surface proves useful.
- Reuse existing Graphify safety docs rather than duplicating validator behavior.

## Known Risks
- Static phrase checks can become brittle if future docs reword the canonical policy; this is acceptable for the requested surface check.

## Current Outcome
- Implementation in progress.

## Next Action
- Add minimal prompt/operator/file-map wiring and rerun static checks.

## Work Summary (2026-05-03 03:05 local) - discovery policy surface

### Goal
- Add static enforcement first, then minimal canonical discovery policy documentation and prompt/operator/file-map/log wiring.

### Files Changed and Why
- `scripts/check-repo-static.sh` — enforces policy doc existence, key discovery choice phrases, and orchestrator/operator/file-map references.
- `.pi/agent/docs/discovery_policy.md` — canonical policy choosing Auggie, Graphify, local read/rg/find, and Exa.
- `.pi/agent/prompts/roles/orchestrator.md` — references the canonical policy for discovery routing choices.
- `.pi/agent/docs/operator_workflow.md` — makes the policy discoverable in the operator loop.
- `.pi/agent/docs/file_map.md` and `README.md` — add policy discoverability.
- `logs/CURRENT.md`, this coding log, and `reports/planning/2026-05-02_discovery-policy-surface-plan.md` — active evidence/log pair for the slice.

### RED Evidence
- `bash scripts/check-repo-static.sh` failed after adding static expectations only.
- Key failure: `Missing required file: .pi/agent/docs/discovery_policy.md`.

### GREEN Evidence
- `bash scripts/check-repo-static.sh` passed: `prompt-contract-validation: PASS (29 prompt files checked)` and `repo-static-checks-ok`.
- `bash scripts/validate-prompt-contracts.sh` passed: `prompt-contract-validation: PASS (29 prompt files checked)`.
- `git diff --check` passed with no output.

### Wiring Verification
- Static check asserts `.pi/agent/docs/discovery_policy.md` exists and contains explicit Auggie/Graphify/local read/rg/find/Exa selection phrases.
- Static check asserts `.pi/agent/prompts/roles/orchestrator.md`, `.pi/agent/docs/operator_workflow.md`, and `.pi/agent/docs/file_map.md` reference the canonical policy.
- `logs/CURRENT.md` manually points to the new planning/coding log pair; this is intentionally not hard-coded in the repo-static check because the active log pointer is expected to change for the next workstream.

### Behavior Changes and Risk Notes
- No runtime behavior changes.
- Main risk is brittle phrase-based static assertions; acceptable for this requested policy-surface slice.

## Review (2026-05-03 03:12 local) - working-tree

### Reviewed
- Repo: `/Users/subhajlimanond/dev/ma-code-worktrees/discovery-policy-surface`
- Branch: `split/discovery-policy-surface`
- Scope: working-tree
- Commands Run: `auggie_discover` (credit-exhausted fallback), `cat logs/CURRENT.md`, `cat logs/coding/2026-05-02_discovery-policy-surface.md`, `git diff --name-status`, `git diff --stat`, `git status --short --branch`, `bash scripts/check-repo-static.sh`, `bash scripts/validate-prompt-contracts.sh`, `git diff --check`

### Findings
CRITICAL
- none

HIGH
- none

MEDIUM
- none

LOW
- none

### Open Questions / Assumptions
- Assumption: documentation/static enforcement is the intended scope; no runtime selector helper should be added in this slice.
- Assumption: `logs/CURRENT.md` is allowed to point to the active log pair but should not be hard-coded into repo-static because it is intentionally a moving pointer.

### Recommended Tests / Validation
- Already run: `bash scripts/check-repo-static.sh`.
- Already run: `bash scripts/validate-prompt-contracts.sh`.
- Already run: `git diff --check`.

### Rollout Notes
- Documentation/static-only change; no runtime behavior changes expected.

Review Verdict: no_required_fixes

## Creation (2026-05-03 03:16 local) - commit artifact

### Review Set
- `.pi/agent/docs/discovery_policy.md`
- `.pi/agent/docs/file_map.md`
- `.pi/agent/docs/operator_workflow.md`
- `.pi/agent/prompts/roles/orchestrator.md`
- `README.md`
- `logs/CURRENT.md`
- `logs/coding/2026-05-02_discovery-policy-surface.md`
- `reports/planning/2026-05-02_discovery-policy-surface-plan.md`
- `scripts/check-repo-static.sh`

### Preconditions
- Working on non-main branch `split/discovery-policy-surface` in isolated worktree.
- g-check completed before commit; verdict `no_required_fixes`.
- Incidental `logs/harness-actions.jsonl` audit-log mutation excluded from the review set.

### Validation Before Commit
- `bash scripts/check-repo-static.sh` -> `repo-static-checks-ok`.
- `bash scripts/validate-prompt-contracts.sh` -> `prompt-contract-validation: PASS (29 prompt files checked)`.
- `git diff --check` -> no output.

### Creation Plan
- Use standard git fallback because existing repo landing flow has used branch push / GitHub PR flow even though `gt` is installed.

### Creation Result
- Commit: branch `split/discovery-policy-surface` HEAD after creation.
- Message: `docs: add discovery policy surface`
- Pre-commit hook: ran staged quality gates and passed (`Fast pre-commit checks passed`).
