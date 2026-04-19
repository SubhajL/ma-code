# Coding Log — harness-020-team-activation

- Date: 2026-04-19
- Scope: Implement a bounded HARNESS-020 team-activation v1 for the repo-local Pi harness.
- Status: in_progress
- Branch: `feat/harness-020-team-activation`
- Related planning log: `reports/planning/2026-04-19_harness-020-team-activation-plan.md`

## Task Group
- add executable team-activation runtime logic
- add machine-readable activation policy
- add a dedicated validator
- update orchestrator/docs for discoverability
- record evidence

## Files Investigated
- `AGENTS.md`
- `README.md`
- `logs/CURRENT.md`
- `pi_harness_implementation_backlog_REPO_LOCAL.md`
- `.pi/agent/docs/team_orchestration_architecture.md`
- `.pi/agent/extensions/harness-routing.ts`
- `.pi/agent/models.json`
- `.pi/agent/teams/planning.yaml`
- `.pi/agent/teams/build.yaml`
- `.pi/agent/teams/quality.yaml`
- `.pi/agent/teams/recovery.yaml`
- `scripts/validate-harness-routing.sh`
- `.pi/agent/prompts/roles/orchestrator.md`
- `.pi/agent/docs/operator_workflow.md`
- `.pi/agent/docs/validation_architecture.md`

## Files Changed
- `.pi/agent/extensions/team-activation.ts`
- `.pi/agent/teams/activation-policy.json`
- `scripts/validate-team-activation.sh`
- `scripts/check-repo-static.sh`
- `.github/workflows/ci.yml`
- `.pi/agent/docs/team_orchestration_architecture.md`
- `.pi/agent/docs/validation_architecture.md`
- `.pi/agent/docs/operator_workflow.md`
- `.pi/agent/docs/file_map.md`
- `.pi/agent/prompts/roles/orchestrator.md`
- `README.md`
- `logs/CURRENT.md`
- `reports/planning/2026-04-19_harness-020-team-activation-plan.md`
- `logs/coding/2026-04-19_harness-020-team-activation.md`
- `reports/validation/2026-04-19_team-activation-validation-script.md`
- `reports/validation/2026-04-19_team-activation-validation-script.json`

## Runtime / Validation Evidence
- RED:
  - `cd /Users/subhajlimanond/dev/ma-code-worktrees/harness-020-team-activation && ./scripts/validate-team-activation.sh`
  - key failure reason: `/bin/bash: ./scripts/validate-team-activation.sh: No such file or directory`
- GREEN:
  - three consecutive local passes:
    - `cd /Users/subhajlimanond/dev/ma-code-worktrees/harness-020-team-activation && ./scripts/validate-team-activation.sh`
    - repeated 3 times, all returned `Team-activation validation PASS`
  - live wiring proof:
    - `cd /Users/subhajlimanond/dev/ma-code-worktrees/harness-020-team-activation && ./scripts/validate-team-activation.sh --include-live`
    - result: `Team-activation validation PASS`
    - live evidence: `resolve_team_activation` tool call observed and expected initial team `build` found
  - supporting gates:
    - `cd /Users/subhajlimanond/dev/ma-code-worktrees/harness-020-team-activation && ./scripts/check-repo-static.sh`
    - result: `repo-static-checks-ok`
    - `cd /Users/subhajlimanond/dev/ma-code-worktrees/harness-020-team-activation && ./scripts/check-foundation-extension-compile.sh`
    - result: `foundation-extension-compile-ok`
    - `cd /Users/subhajlimanond/dev/ma-code-worktrees/harness-020-team-activation && TMP=$(mktemp -d) && ./scripts/validate-skill-routing.sh --skip-live --report "$TMP/skill.md" --summary-json "$TMP/skill.json" && ./scripts/validate-harness-routing.sh --report "$TMP/harness.md" --summary-json "$TMP/harness.json" && ./scripts/validate-team-activation.sh --report "$TMP/team.md" --summary-json "$TMP/team.json"`
    - result: `Skill-routing validation PASS`, `Harness-routing validation PASS`, `Team-activation validation PASS`
    - `cd /Users/subhajlimanond/dev/ma-code-worktrees/harness-020-team-activation && ruby -e 'require "yaml"; Dir[".github/**/*.yml", ".github/**/*.yaml"].sort.each { |f| YAML.load_file(f); puts "yaml-ok #{f}" }'`
    - result: YAML parse ok for `.github/dependabot.yml`, `.github/workflows/ci.yml`, `.github/workflows/security.yml`

## Key Findings
- HARNESS-017 deliberately stopped at model/provider route resolution and left team activation unimplemented.
- Team membership definitions already exist under `.pi/agent/teams/*.yaml`.
- Team activation rules exist in prose under `.pi/agent/docs/team_orchestration_architecture.md` but are not yet executable.

## Decisions Made
- keep HARNESS-020 bounded to deterministic team selection/sequence/overlap logic
- do not absorb HARNESS-021 task packet generation
- prefer a machine-readable activation policy plus one runtime tool and one dedicated validator
- reuse existing `.pi/agent/teams/*.yaml` files as team-membership inputs instead of inventing a second team-definition source
- add the new validator to CI `Routing Validators` so the regression path is not local-only

## Known Risks
- activation-input shape could widen if packet-generation concerns leak in
- live proof may be limited by provider/model availability

## Current Outcome
- planning completed
- implementation completed
- validation completed

## Next Action
- run skeptical self-review and prepare commit/PR when requested

## Implementation Summary (2026-04-19 17:46:00 +0700)

### Goal
- Implement a bounded HARNESS-020 executable team-activation surface so the orchestrator can choose planning/build/quality/recovery deterministically instead of relying only on prose docs.

### What changed
- Added machine-readable activation policy at `.pi/agent/teams/activation-policy.json`.
- Added executable activation resolver at `.pi/agent/extensions/team-activation.ts`.
- Added dedicated validator at `scripts/validate-team-activation.sh`.
- Wired the validator into:
  - `scripts/check-repo-static.sh`
  - `.github/workflows/ci.yml`
- Updated discoverability/operator docs:
  - `.pi/agent/docs/team_orchestration_architecture.md`
  - `.pi/agent/docs/validation_architecture.md`
  - `.pi/agent/docs/operator_workflow.md`
  - `.pi/agent/docs/file_map.md`
  - `README.md`
- Updated orchestrator guidance to prefer executable team-activation/routing policy when available.

### TDD evidence
- RED:
  - missing validator script failure from `./scripts/validate-team-activation.sh`
- GREEN:
  - helper-level team activation checks now pass
  - TypeScript compile check for `team-activation.ts` passes
  - one bounded live probe observed `resolve_team_activation` and expected initial team `build`
  - three consecutive local passes completed for the changed validation scope

### Wiring verification evidence
- Runtime wiring:
  - `.pi/settings.json` loads `agent/extensions`, so `.pi/agent/extensions/team-activation.ts` is in the project-local extension search path
  - bounded live probe command:
    - `pi --no-session --no-extensions -e ./.pi/agent/extensions/team-activation.ts --mode json "Use resolve_team_activation for implementation work with clear requirements, bounded scope, explicit acceptance criteria, known repo impact, and only backend domain. Then report the first selected team in one sentence."`
  - result: tool call `resolve_team_activation` observed; expected `"initialTeam":"build"` found
- Policy/data wiring:
  - validator reads `.pi/agent/teams/activation-policy.json`
  - validator parses `.pi/agent/teams/planning.yaml`, `.pi/agent/teams/build.yaml`, `.pi/agent/teams/quality.yaml`, `.pi/agent/teams/recovery.yaml`
- CI wiring:
  - `.github/workflows/ci.yml` `Routing Validators` job now runs `./scripts/validate-team-activation.sh`

### Behavior / risk notes
- this implements deterministic activation/sequence/overlap resolution, not full task-packet generation or queue-driven dispatch
- recovery intentionally stops normal flow in this bounded v1 until retry/reroute/rollback/escalation is decided
- future HARNESS-021+ work may require richer inputs than the current bounded activation schema

## Review (2026-04-19 17:47:00 +0700) - working-tree

### Reviewed
- Repo: `/Users/subhajlimanond/dev/ma-code-worktrees/harness-020-team-activation`
- Branch: `feat/harness-020-team-activation`
- Scope: `working-tree`
- Commands Run:
  - `git status --porcelain=v1`
  - `git diff --name-only`
  - `git diff --stat`
  - targeted `git diff` on runtime, validator, CI, and prompt files
  - validation commands recorded above

### Findings
CRITICAL
- none

HIGH
- none

MEDIUM
- none

LOW
- the current activation input schema is intentionally compact and may need extension once HARNESS-021 task packets exist
  - Why it matters: richer packet/runtime state may enable more precise activation decisions later
  - Fix direction: extend the policy and input schema conservatively when packet semantics are implemented
  - Validation still needed: add/adjust helper cases in `scripts/validate-team-activation.sh` when new activation inputs are introduced

### Open Questions / Assumptions
- assumed bounded executable activation is the correct HARNESS-020 slice and that full dispatch/packet generation belongs to later tasks

### Recommended Tests / Validation
- rerun `./scripts/validate-team-activation.sh` after any changes to activation policy, team YAML membership, or the team-activation extension
- let GitHub run the updated `Routing Validators` job on the eventual PR

### Rollout Notes
- the new resolver is safe to expose now because it only returns deterministic decisions; it does not launch workers or mutate runtime state
- CI now catches regressions in team-activation policy/runtime before merge

### Review Verdict
- no_required_fixes
