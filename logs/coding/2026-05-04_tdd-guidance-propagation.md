# Coding Log — tdd-guidance-propagation

- Date: 2026-05-04
- Scope: Propagate behavior-first TDD guidance across prompt/policy/validation surfaces without packet schema churn.
- Status: complete
- Branch: `task/task-1777897119481-tdd-behavior-propagation`
- Related planning log: `reports/planning/2026-05-04_tdd-guidance-propagation-plan.md`

## Task Group
- Implement the approved TDD-guidance propagation slice from the architecture review: worker/build/planning/review/validation prompts, packet policy defaults, and static drift checks.

## Files Investigated
- `packages/pi-g-skills/skills/g-planning/SKILL.md`
- `packages/pi-g-skills/skills/g-coding/SKILL.md`
- `.pi/agent/prompts/roles/planning_lead.md`
- `.pi/agent/prompts/roles/build_lead.md`
- `.pi/agent/prompts/roles/frontend_worker.md`
- `.pi/agent/prompts/roles/backend_worker.md`
- `.pi/agent/prompts/roles/infra_worker.md`
- `.pi/agent/prompts/roles/reviewer_worker.md`
- `.pi/agent/prompts/roles/validator_worker.md`
- `.pi/agent/skills/validation-checklist/SKILL.md`
- `.pi/agent/packets/packet-policy.json`
- `.pi/agent/extensions/task-packets.ts`
- `scripts/check-repo-static.sh`
- `scripts/validate-prompt-contracts.sh`
- `scripts/validate-prompt-semantics.sh`
- `scripts/validate-task-packets.sh`
- `.pi/agent/docs/tdd_behavior_first_workflow.md`
- `.pi/agent/docs/deep_module_refactoring_workflow.md`

## Files Changed
- `packages/pi-g-skills/skills/g-planning/SKILL.md` — added explicit TDD slice-contract planning requirements.
- `.pi/agent/prompts/roles/planning_lead.md` — planning prompt now requires tracer behavior, public interface, boundary dependency/mock plan, and excluded behaviors.
- `.pi/agent/prompts/roles/build_lead.md` — build prompt now preserves the TDD slice contract and packet proof expectations.
- `.pi/agent/prompts/roles/frontend_worker.md` — added compact behavior-first TDD worker rules.
- `.pi/agent/prompts/roles/backend_worker.md` — added compact behavior-first TDD worker rules.
- `.pi/agent/prompts/roles/infra_worker.md` — added compact behavior-first TDD worker rules.
- `.pi/agent/prompts/roles/reviewer_worker.md` — reviewer now challenges private-helper/call-order/owned-collaborator test coupling and missing RED/GREEN evidence.
- `.pi/agent/prompts/roles/validator_worker.md` — validator now treats implementation-coupled tests as weak proof and requires RED/GREEN evidence when relevant.
- `.pi/agent/skills/validation-checklist/SKILL.md` — validation checklist now checks RED/GREEN proof and TDD test-quality anti-patterns.
- `.pi/agent/packets/packet-policy.json` — packet defaults/team expectations now carry RED/GREEN proof, behavior/public-interface naming, TDD slice contract, and weak-proof rejection text without schema churn.
- `scripts/check-repo-static.sh` — added cheap drift guards for the new TDD contract across planning/build/worker/review/validation/policy surfaces.
- `logs/CURRENT.md` — repointed active logs to this feature group.
- `reports/planning/2026-05-04_tdd-guidance-propagation-plan.md` — created planning log.
- `logs/coding/2026-05-04_tdd-guidance-propagation.md` — created coding log.

## Runtime / Validation Evidence
- Discovery path: Auggie-first attempted and timed out; local `read`/`rg`/`find` fallback used.
- Executable policy check: `select_discovery_policy` for exact verification with known targets returned `local`.
- RED: `bash scripts/check-repo-static.sh` failed immediately after adding the new TDD drift guards and before prompt/policy updates with a Python `AssertionError`, proving the newly required TDD slice/worker/validator/packet-policy strings were not yet present.
- GREEN: `bash scripts/check-repo-static.sh` passed after the prompt/policy updates with `prompt-contract-validation: PASS (29 prompt files checked)` and `repo-static-checks-ok`; repeated two additional GREEN runs also passed.
- Additional validation: `bash scripts/validate-prompt-contracts.sh` PASS; `bash scripts/validate-prompt-semantics.sh` PASS (`10 fixtures checked`); `bash scripts/validate-task-packets.sh --report /tmp/tdd-guidance-task-packets.md --summary-json /tmp/tdd-guidance-task-packets.json` PASS; `git diff --check` PASS.
- Readback proof: targeted `rg` confirmed the inserted TDD slice-contract, worker TDD, reviewer/validator, and packet-policy strings across the changed files.
- Narrow flake choice: because this is a prompt/policy/static slice rather than executable runtime logic, repeated GREEN coverage focused on the most direct changed surface (`check-repo-static.sh`) while the broader prompt/task-packet validators were run once each.

## Key Findings
- `g-coding` and the TDD/deep-module docs already contain most of the desired methodology.
- Planning/build/worker/review/validation surfaces were less explicit and relied too much on generic “smallest validation” language.
- Task packets already render `evidenceExpectations`, `validationExpectations`, `expectedProof`, and `wiringChecks`, so policy defaults can carry the new TDD contract without schema changes.
- Prompt contracts/semantics did not need output-shape changes; cheap static drift guards were enough to enforce the new wording on the added surfaces.

## Decisions Made
- Implement the prompt/docs/policy-only enhancement first.
- Avoid typed packet schema changes in this slice.
- Use `scripts/check-repo-static.sh` as the main RED/GREEN drift guard.

## Known Risks
- Prompt-only guidance can drift again later if cheap static assertions are too weak.
- Exact-string assertions must stay concise enough to avoid overfitting or prompt bloat.

## Current Outcome
- Prompt/policy/static updates are implemented in the task worktree and validated locally.
- The slice remains prompt/docs/policy-only; no packet schema or runtime behavior changes were required.

## Next Action
- Run skeptical review/g-check-style diff review, then commit, open a PR, merge to main, and sync local root main.

## Review (2026-05-04T11:34:00Z) - working-tree

### Reviewed
- Repo: `/Users/subhajlimanond/dev/ma-code-worktrees/task-1777897119481-tdd-behavior-propagation`
- Branch: `task/task-1777897119481-tdd-behavior-propagation`
- Scope: `working-tree`
- Commands Run:
  - `git diff --stat`
  - `git diff --name-only`
  - `git diff -- .pi/agent/packets/packet-policy.json .pi/agent/prompts/roles/backend_worker.md .pi/agent/prompts/roles/build_lead.md .pi/agent/prompts/roles/frontend_worker.md .pi/agent/prompts/roles/infra_worker.md .pi/agent/prompts/roles/planning_lead.md .pi/agent/prompts/roles/reviewer_worker.md .pi/agent/prompts/roles/validator_worker.md .pi/agent/skills/validation-checklist/SKILL.md packages/pi-g-skills/skills/g-planning/SKILL.md scripts/check-repo-static.sh logs/CURRENT.md`
  - `bash scripts/check-repo-static.sh`
  - `bash scripts/validate-prompt-contracts.sh`
  - `bash scripts/validate-prompt-semantics.sh`
  - `bash scripts/validate-task-packets.sh --report /tmp/tdd-guidance-task-packets.md --summary-json /tmp/tdd-guidance-task-packets.json`
  - `git diff --check`

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
- Assumption: prompt/docs/policy-only propagation is the intended first slice and semantic fixtures for build workers can wait for a later follow-up if needed.

### Recommended Tests / Validation
- `bash scripts/check-repo-static.sh`
- `bash scripts/validate-prompt-contracts.sh`
- `bash scripts/validate-prompt-semantics.sh`
- `bash scripts/validate-task-packets.sh --report /tmp/tdd-guidance-task-packets.md --summary-json /tmp/tdd-guidance-task-packets.json`
- `git diff --check`

### Rollout Notes
- Prompt/policy-only change; no runtime routing, queue, or packet schema behavior changed.
- Existing `g-coding` and TDD/deep-module docs remain the primary long-form methodology sources.

Review Verdict: no_required_fixes
