# Coding Log — skill-routing-validator

- Date: 2026-04-19
- Scope: Add a dedicated validator for the repo-local `g-skill-auto-route` extension.
- Status: complete
- Branch: ma-code/logs-planning-20260417
- Related planning log: `reports/planning/2026-04-19_skill-routing-validator-plan.md`

## Task Group
- add a dedicated routing validator script
- validate helper-level and live routing behavior
- update minimal validation/operator docs

## Files Investigated
- `logs/CURRENT.md`
- `logs/README.md`
- `.pi/agent/extensions/g-skill-auto-route.ts`
- `.pi/agent/docs/validation_architecture.md`
- `.pi/agent/docs/operator_workflow.md`
- `.pi/agent/docs/file_map.md`
- `scripts/validate-phase-a-b.sh`
- `reports/validation/2026-04-19_skill-routing-validation-script.md`
- `reports/validation/2026-04-19_skill-routing-validation-script.json`

## Files Changed
- `.pi/agent/extensions/g-skill-auto-route.ts`
- `scripts/validate-skill-routing.sh`
- `.pi/agent/docs/validation_architecture.md`
- `.pi/agent/docs/operator_workflow.md`
- `.pi/agent/docs/file_map.md`
- `logs/CURRENT.md`
- `reports/planning/2026-04-19_skill-routing-validator-plan.md`
- `logs/coding/2026-04-19_skill-routing-validator.md`
- `reports/validation/2026-04-19_skill-routing-validation-script.md`
- `reports/validation/2026-04-19_skill-routing-validation-script.json`

## Runtime / Validation Evidence
- RED:
  - `cd /Users/subhajlimanond/dev/ma-code && ./scripts/validate-skill-routing.sh`
  - result before implementation:
    - `/bin/bash: ./scripts/validate-skill-routing.sh: No such file or directory`
  - key failure reason:
    - dedicated skill-routing validator did not exist yet
- GREEN:
  - validator execution:
    - `cd /Users/subhajlimanond/dev/ma-code && ./scripts/validate-skill-routing.sh`
    - result: `Skill-routing validation PASS`
  - generated reports:
    - `reports/validation/2026-04-19_skill-routing-validation-script.md`
    - `reports/validation/2026-04-19_skill-routing-validation-script.json`
  - helper-level route checks passed for:
    - planning intent → `g-planning`
    - coding intent → `g-coding`
    - bounded review intent → `g-check`
    - architecture review intent → `g-review`
    - explicit `/skill:g-coding` preservation
    - bare `review` non-match guard
  - TypeScript compile check passed for copied validator target:
    - `npx tsc --noEmit --skipLibCheck --moduleResolution nodenext --module nodenext --target es2022 --lib es2022,dom --types node src/g-skill-auto-route.ts`
  - live probes were executed and recorded as `SKIP` rather than false `FAIL` when the current environment reported provider/model unavailability and low Anthropic credits

## Key Findings
- a dedicated routing validator is cleaner than widening `scripts/validate-phase-a-b.sh`
- deterministic helper-level checks are the strongest signal for routing correctness in this environment
- live Pi probes are still useful, but they must degrade to `SKIP` when provider/model access is unavailable instead of incorrectly failing the validator
- exporting pure route helpers from `g-skill-auto-route.ts` gives the validator a stable, low-friction test surface

## Decisions Made
- keep the validator separate at `scripts/validate-skill-routing.sh`
- export pure helpers from `.pi/agent/extensions/g-skill-auto-route.ts` for deterministic validation:
  - `SkillName`
  - `SkillRoute`
  - `SKILL_PATTERNS`
  - `detectSkillRoute()`
  - `buildSkillCommand()`
- update only the minimal discoverability docs:
  - `.pi/agent/docs/validation_architecture.md`
  - `.pi/agent/docs/operator_workflow.md`
  - `.pi/agent/docs/file_map.md`
- treat provider/credit failures during live probes as `SKIP`, not `FAIL`

## Known Risks
- live end-to-end routing proof remains limited in this environment because provider/model access is currently unreliable
- if future extensions add more `input` handlers, broader multi-extension routing integration tests may still be needed
- the validator currently relies on a temporary `npm install` path for `tsx`/`typescript` tooling during helper-level checks

## Current Outcome
- a dedicated skill-routing validator exists at `scripts/validate-skill-routing.sh`
- the validator writes markdown and JSON outputs under `reports/validation/`
- operator and validation docs now mention the new validator and when to run it
- the active log pointer now points at this bounded validator workstream

## Next Action
- when provider/model access is stable again, re-run `./scripts/validate-skill-routing.sh` and confirm that currently skipped live probes become `PASS`

## Implementation Summary (2026-04-19 10:26:00 +0700)

### Goal
- Add a repeatable validator for the `g-skill-auto-route` extension without widening the existing Phase A/B validator.

### What changed
- Added `scripts/validate-skill-routing.sh`.
- Exported pure route helpers from `.pi/agent/extensions/g-skill-auto-route.ts` so the validator can test route classification deterministically.
- Updated validation/operator discoverability docs.
- Ran the validator and saved its markdown/JSON outputs.

### TDD evidence
- RED:
  - missing-script failure from `./scripts/validate-skill-routing.sh`
- GREEN:
  - `./scripts/validate-skill-routing.sh` returned `Skill-routing validation PASS`
  - report outputs were generated under `reports/validation/`

### Wiring verification evidence
- Script wiring:
  - `scripts/validate-skill-routing.sh` is executable and runs from repo root
- Validation output wiring:
  - outputs written to `reports/validation/2026-04-19_skill-routing-validation-script.md`
  - outputs written to `reports/validation/2026-04-19_skill-routing-validation-script.json`
- Helper export wiring:
  - `.pi/agent/extensions/g-skill-auto-route.ts` exports route helpers consumed by the validator’s `tsx` check
- Operator doc wiring:
  - `.pi/agent/docs/operator_workflow.md` now points routing changes to `./scripts/validate-skill-routing.sh`
  - `.pi/agent/docs/validation_architecture.md` now lists the dedicated skill-routing validator
  - `.pi/agent/docs/file_map.md` now includes the new validator script

### Behavior / risk notes
- helper-level checks provide deterministic coverage for all requested route cases
- live probes intentionally degrade to `SKIP` when provider/model access is unavailable, preserving honest reports instead of noisy false failures

## Review (2026-04-19 10:27:00 +0700) - working-tree

### Reviewed
- Repo: `/Users/subhajlimanond/dev/ma-code`
- Branch: `ma-code/logs-planning-20260417`
- Scope: `working-tree`
- Commands Run:
  - `cd /Users/subhajlimanond/dev/ma-code && ./scripts/validate-skill-routing.sh`
  - `cd /Users/subhajlimanond/dev/ma-code && rg -n "validate-skill-routing|g-skill-auto-route|Primary validators|Dedicated skill-routing validator|skill-routing changes" .pi/agent/docs/validation_architecture.md .pi/agent/docs/operator_workflow.md .pi/agent/docs/file_map.md scripts/validate-skill-routing.sh`
  - readback of `scripts/validate-skill-routing.sh`
  - readback of `.pi/agent/docs/operator_workflow.md`
  - readback of `.pi/agent/docs/validation_architecture.md`
  - readback of `reports/validation/2026-04-19_skill-routing-validation-script.md`
  - readback of `reports/validation/2026-04-19_skill-routing-validation-script.json`

### Findings
CRITICAL
- none

HIGH
- none

MEDIUM
- none

LOW
- Live probes are currently `SKIP` rather than `PASS` because provider/model access is unavailable in this environment.
  - Why it matters: end-to-end routing proof is currently weaker than helper-level route proof.
  - Fix direction: re-run the validator when provider/model access is restored; keep helper-level checks as the baseline regression signal.
  - Validation still needed: future rerun with working provider/model access.

### Open Questions / Assumptions
- Assumed a dedicated script is preferable to extending the Phase A/B validator for this narrower concern.
- Assumed helper-level route validation is an acceptable primary signal when live probes are environmentally blocked.

### Recommended Tests / Validation
- Re-run `./scripts/validate-skill-routing.sh` when provider/model access is restored to convert live probe `SKIP` results into `PASS` where possible.
- If more `input`-handling extensions are added later, add a multi-extension routing integration test.

### Rollout Notes
- This is a repo-local validator only.
- No safety/task-discipline runtime behavior was changed.
- No queue/autonomy/package work was added.

### Review Verdict
- no_required_fixes
