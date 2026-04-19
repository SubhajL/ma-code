# Coding Log — validation-cost-guardrails

- Date: 2026-04-19
- Scope: Make expensive live-validator usage policy repo-persistent for this harness repo.
- Status: complete
- Branch: unknown (no `.git` directory visible under `/Users/subhajlimanond/dev/ma-code` in this environment)
- Related planning log: `reports/planning/2026-04-19_validation-cost-guardrails-plan.md`

## Task Group
- persist validation-cost guardrails in repo instructions
- document cheap/local-first validation workflow
- avoid new expensive live validation loops for this task

## Files Investigated
- `AGENTS.md`
- `SYSTEM.md`
- `.pi/SYSTEM.md`
- `logs/README.md`
- `logs/CURRENT.md`

## Files Changed
- `AGENTS.md`
- `.pi/SYSTEM.md`
- `.pi/agent/docs/operator_workflow.md`
- `logs/CURRENT.md`
- `reports/planning/2026-04-19_validation-cost-guardrails-plan.md`
- `logs/coding/2026-04-19_validation-cost-guardrails.md`

## Runtime / Validation Evidence
- RED:
  - not practical for this docs/policy change; there is no bounded failing runtime test surface needed before editing
- GREEN:
  - readback confirmed the new guardrail text in `AGENTS.md`, `.pi/SYSTEM.md`, and `.pi/agent/docs/operator_workflow.md`
  - `rg -n "cheap/local validation|one live provider-backed validator run|repeated long \\`pi ...\\`|flake investigation" AGENTS.md .pi/SYSTEM.md .pi/agent/docs/operator_workflow.md logs/CURRENT.md`
  - `logs/CURRENT.md` now points to this bounded workstream

## Key Findings
- repeated `pi ...` validator loops are expensive because they can trigger provider-backed model calls
- this repo already has persistent workflow instruction surfaces (`AGENTS.md`, `.pi/SYSTEM.md`) suitable for codifying the cheaper default policy
- operator workflow docs are the right place to explain when one live run is enough versus when repeated runs need approval

## Decisions Made
- implement this as repo-local instruction and workflow guidance, not as runtime code
- keep validation for this task cheap: readback and grep only

## Known Risks
- instruction-layer policy depends on future agents following repo guidance
- no runtime hard block yet prevents an agent from choosing an expensive loop

## Current Outcome
- planning completed
- instruction updates completed
- readback/grep validation completed

## Next Action
- hand off the bounded change with summary, evidence, and residual risk

## Work Summary (2026-04-19 11:25:00 +0700)
- Goal of change:
  - make the cheaper validation policy persistent so repeated provider-backed live validator loops are not the default
- Files changed and why:
  - `AGENTS.md` — added repo validation-cost guardrails
  - `.pi/SYSTEM.md` — reinforced the same policy in project system guidance
  - `.pi/agent/docs/operator_workflow.md` — documented cheap/local-first order and when repeated live reruns are allowed
  - `logs/CURRENT.md` — switched active pointer to this bounded workstream
  - paired planning/coding logs — recorded scope, acceptance criteria, and evidence
- Tests added or changed:
  - none; docs/instruction-only change
- Exact RED command and key failure reason:
  - none; a failing runtime RED test was not practical for this instruction-layer change
- Exact GREEN command:
  - `cd /Users/subhajlimanond/dev/ma-code && rg -n "cheap/local validation|one live provider-backed validator run|Repeated live \`pi \.\.\.\`|repeated long \`pi \.\.\.\`|flake investigation" AGENTS.md .pi/SYSTEM.md .pi/agent/docs/operator_workflow.md logs/CURRENT.md`
- Other validation commands run:
  - readback of `AGENTS.md`, `.pi/SYSTEM.md`, `.pi/agent/docs/operator_workflow.md`, and `logs/CURRENT.md`
- Wiring verification evidence:
  - future-session instruction surfaces now contain the policy in both repo rules and Pi project system guidance
- Behavior changes and risk notes:
  - default workflow now explicitly prefers cheap/local checks first, one live run when needed, and approval for repeated long live loops
  - this is instruction-layer guidance, not a hard runtime block
- Follow-ups or known gaps:
  - a future runtime or validator-budget guardrail could enforce this more strongly

## Review (2026-04-19 11:25:00 +0700) - working-tree

### Reviewed
- Repo: `/Users/subhajlimanond/dev/ma-code`
- Branch: unknown (no `.git` directory visible here)
- Scope: `working-tree`
- Commands Run: `read`, `rg`

### Findings
CRITICAL
- none

HIGH
- none

MEDIUM
- none

LOW
- policy is instruction-layer only; a future runtime hard guard would make this stronger

### Open Questions / Assumptions
- assumes `AGENTS.md` and `.pi/SYSTEM.md` continue to be loaded in future sessions as the primary persistent instruction surfaces

### Recommended Tests / Validation
- readback/grep of the changed instruction files
- no live provider-backed validator reruns needed for this docs/policy task

### Rollout Notes
- applies immediately to future repo work in this harness repo
