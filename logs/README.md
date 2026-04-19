# Harness Logging Convention

This repo keeps lightweight, file-backed logs for each feature or bounded task group.

## Active pointer
- `logs/CURRENT.md`

Always update `logs/CURRENT.md` when a new feature group becomes the active workstream.

## Coding logs
Location:
- `logs/coding/`

Naming:
- `YYYY-MM-DD_<feature-or-task-group>.md`

Examples:
- `2026-04-17_phase-a-b-foundation.md`
- `2026-04-18_safe-bash-v1.md`
- `2026-04-19_till-done-v1.md`

Use a coding log to capture:
- scope
- files investigated
- files changed
- runtime or test evidence
- key findings
- known risks
- current outcome

## Planning logs
Location:
- `reports/planning/`

Naming:
- `YYYY-MM-DD_<feature-or-task-group>-plan.md`

Examples:
- `2026-04-17_phase-a-b-foundation-plan.md`
- `2026-04-18_safe-bash-v1-plan.md`
- `2026-04-19_till-done-v1-plan.md`

Use a planning log to capture:
- implementation plan
- file-by-file breakdown
- dependencies
- acceptance criteria
- likely failure modes
- recommended next step

## One feature group = one paired log set
For each bounded implementation unit, prefer a pair:
- coding log: `logs/coding/...`
- planning log: `reports/planning/...`

Examples:
- `safe-bash-v1`
- `till-done-v1`
- `routing-hardening`
- `task-schema-v1`

## Validation reports
Location:
- `reports/validation/`

Typical files:
- `YYYY-MM-DD_<feature>-validation.md`
- `YYYY-MM-DD_<feature>-validation.json`

Use validation reports to capture:
- validator run results
- pass/fail summary
- exact commands or script used
- cleanup status
- remaining caveats

## Validator automation
Primary runtime validator script:
- `scripts/validate-phase-a-b.sh`

Supporting docs:
- `.pi/agent/docs/runtime_validation_runbook.md`
- `.pi/agent/docs/operator_workflow.md`

## Update workflow
1. Create the planning log.
2. Create the coding log.
3. Update `logs/CURRENT.md` to point to both.
4. Append relevant findings as work progresses.
5. Keep logs focused on one bounded feature group.

## Templates
- `logs/coding/TEMPLATE.md`
- `reports/planning/TEMPLATE.md`

## Rules
- Do not use one giant running log for unrelated work.
- Keep one active pointer only in `logs/CURRENT.md`.
- Save planning data before or alongside implementation.
- Save validation evidence in the related coding log.
- Record unresolved risks instead of hiding them.
