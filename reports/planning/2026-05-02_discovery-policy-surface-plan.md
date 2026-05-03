# Planning Log — discovery-policy-surface

- Date: 2026-05-02
- Scope: canonical discovery policy doc, prompt reference, operator/file-map discoverability, static enforcement
- Status: ready
- Related coding log: `logs/coding/2026-05-02_discovery-policy-surface.md`

## Goal
- Add one canonical discovery policy surface that explicitly chooses among Auggie, Graphify, local read/rg/find, and Exa.
- Enforce the policy surface with repo-static checks without changing runtime behavior.

## Scope
- Static check expectations.
- Minimal doc/prompt/operator/file-map wiring.
- Log pointer update for this bounded workstream.

## Files to Create or Edit
- `scripts/check-repo-static.sh`
- `.pi/agent/docs/discovery_policy.md`
- `.pi/agent/prompts/roles/orchestrator.md`
- `.pi/agent/docs/operator_workflow.md`
- `.pi/agent/docs/file_map.md`
- `README.md`
- `logs/CURRENT.md`
- `logs/coding/2026-05-02_discovery-policy-surface.md`

## Why Each File Exists
- Static check proves the policy surface and references remain present.
- Discovery policy doc is the canonical human-readable selector.
- Orchestrator prompt points routing decisions at the canonical selector.
- Operator/file-map/README wiring makes the policy discoverable.
- Logs preserve evidence for this slice.

## What Logic Belongs There
- Documentation-only selection rules and tool boundaries.
- Static phrase/path assertions.

## What Should Not Go There
- Runtime discovery selector helper.
- Queue/routing behavior changes.
- Duplicate Graphify validator behavior.

## Dependencies
- Existing repo-static script.
- Existing prompt-contract validator remains unchanged.

## Acceptance Criteria
- One canonical discovery policy doc exists.
- It explicitly chooses among Auggie, Graphify, local read/rg/find, and Exa.
- Orchestrator prompt references it.
- Static check enforces the policy surface exists.
- Operator docs/file map make it discoverable.
- No runtime behavior changes.

## Likely Failure Modes
- Static check becomes too brittle.
- Prompt edit breaks prompt-contract validation.
- The doc duplicates Graphify-specific policy instead of coordinating discovery choices.

## Validation Plan
- RED: run `bash scripts/check-repo-static.sh` after adding static expectation only and confirm missing policy failure.
- GREEN: run `bash scripts/check-repo-static.sh` after adding doc/wiring.
- Run `bash scripts/validate-prompt-contracts.sh` because the orchestrator prompt is touched.
- Run `git diff --check`.
- Run g-check review before PR/merge.

## Recommended Next Step
- Add minimal wiring, validate, review, then land through PR/merge.
