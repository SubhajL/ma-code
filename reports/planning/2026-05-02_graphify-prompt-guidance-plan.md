# Planning Log — graphify-prompt-guidance

- Date: 2026-05-02
- Scope: Add enforced Graphify-specific prompt guidance to orchestrator, reviewer, and validator roles.
- Status: ready
- Related coding log: `logs/coding/2026-05-02_graphify-prompt-guidance.md`

## Goal
- Strengthen critical-role prompts so Graphify is treated as optional bounded discovery evidence requiring freshness/confidence skepticism and direct-source verification.

## Scope
- Update orchestrator, reviewer_worker, and validator_worker prompts.
- Update prompt-contract validation so the new guidance is executable and drift-resistant.
- Use a dedicated non-main worktree and land through PR.

## Files to Create or Edit
- `.pi/agent/prompts/roles/orchestrator.md`
- `.pi/agent/prompts/roles/reviewer_worker.md`
- `.pi/agent/prompts/roles/validator_worker.md`
- `.pi/agent/validation/prompt-contracts.json`
- `logs/CURRENT.md`
- `logs/coding/2026-05-02_graphify-prompt-guidance.md`
- `reports/planning/2026-05-02_graphify-prompt-guidance-plan.md`

## Why Each File Exists
- Role prompts carry the runtime prompt guidance.
- Prompt contracts make the guidance enforceable by validator/static checks.
- Logs record bounded implementation and review evidence.

## What Logic Belongs There
- Prompt-level routing/skepticism/proof expectations for Graphify-derived claims.
- Exact contract substrings that validate the new role guidance.

## What Should Not Go There
- New Graphify runtime behavior.
- Broad prompt rewrites beyond the requested roles.
- Changes to Graphify adapter safety policy.

## Dependencies
- Current Graphify adapter and canonical validator already merged on `main`.
- Existing prompt-contract validator and static checks.

## Acceptance Criteria
- The three requested prompts include explicit Graphify guidance.
- Prompt-contract validation fails before prompt updates and passes after them.
- Graphify validator/static checks pass.
- g-check review finds no required fixes.
- PR merges to `main` and local main is synced.

## Likely Failure Modes
- Adding prompt-only guidance without executable contract enforcement.
- Wording that makes Graphify mandatory or graph-only proof acceptable.
- Forgetting to preserve output contract headers.

## Validation Plan
- `bash scripts/validate-prompt-contracts.sh`
- `bash scripts/validate-graphify-discovery.sh`
- `bash scripts/check-repo-static.sh`
- `git diff --check`
- g-check-style diff review.

## Recommended Next Step
- Implement the prompt/contract changes, validate, review, commit, PR, merge, and sync local main.
