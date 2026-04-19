# Planning Log — validation-cost-guardrails

- Date: 2026-04-19
- Scope: Make expensive live-validator usage policy repo-persistent for this harness repo.
- Status: complete
- Related coding log: `logs/coding/2026-04-19_validation-cost-guardrails.md`

## Discovery Path
- Used local discovery and readback of repo instructions and workflow docs.
- Inspected:
  - `AGENTS.md`
  - `SYSTEM.md`
  - `.pi/SYSTEM.md`
  - `logs/README.md`
  - `logs/CURRENT.md`
  - existing foundation-closeout logs for current context

## Goal
- Persist a low-cost validation policy so the agent avoids expensive repeated provider-backed `pi ...` validator loops by default.

## Non-Goals
- no runtime extension changes
- no validator script behavior changes
- no model/provider configuration changes
- no new live Pi validation runs just to prove the policy text

## Acceptance Criteria
- `AGENTS.md` includes a repo rule for expensive provider-backed validation loops
- `.pi/SYSTEM.md` reinforces the same policy for future sessions
- `.pi/agent/docs/operator_workflow.md` documents the cheap/local-first and single-live-run default
- active planning/coding logs are updated and `logs/CURRENT.md` points to them
- validation is done via readback/grep only

## Planned Changes
- Add a validation-cost guardrail section to `AGENTS.md`
- Add matching project-system guidance to `.pi/SYSTEM.md`
- Add operator workflow guidance distinguishing local checks from provider-backed live validators
- Create a bounded log pair and update the active pointer

## Validation Plan
- Use `rg` to confirm the new policy text exists in the intended files
- Read back the changed files for exact wording
- Do not run repeated live provider-backed validator loops for this docs/policy task

## Risks
- This is instruction-layer enforcement, not runtime enforcement
- Existing skill docs still mention repeated pass targets generally, so repo-local rules must remain the stronger operational override

## Pi Log Update
- planning log: `reports/planning/2026-04-19_validation-cost-guardrails-plan.md`
- coding log: `logs/coding/2026-04-19_validation-cost-guardrails.md`
