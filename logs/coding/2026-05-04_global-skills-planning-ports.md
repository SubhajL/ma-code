# Coding Log — global-skills-planning-ports

- Date: 2026-05-04
- Scope: Add global skill ports for grill, PRD, issues, and refactor workflows.
- Status: in_progress
- Branch: `split/task-1777913405704-global-skills`
- Task: `task-1777913405704`
- Related planning log: `reports/planning/2026-05-04_global-skills-planning-ports-plan.md`

## Discovery Path
- Read `AGENTS.md`, `README.md`, `logs/CURRENT.md`, `packages/pi-g-skills/skills/g-coding/SKILL.md`.
- Attempted Auggie first for bounded discovery; it timed out.
- Used local fallback: targeted `read`, `find`, `rg`, and file inspection in `packages/pi-g-skills/`, `scripts/validate-skill-routing.sh`, `scripts/check-repo-static.sh`, and product/refactor workflow docs.

## TDD Plan
- First tracer-bullet behavior: the repo static checker fails once new global-skill presence/discoverability contracts are required and the new skill files/docs do not yet exist.
- Public interface: `bash scripts/check-repo-static.sh` plus `bash scripts/validate-skill-routing.sh --skip-live`.
- Boundary dependencies/mock plan: static docs/skill files only; no provider-backed calls, no Graphify runtime integration in this slice.
- Out of scope: Graphify runtime adapter/tools, repo-local prompt/template rewiring beyond minimal skill discoverability docs, and issue-tracker publishing/runtime queue integration.

## Work Summary (2026-05-04T16:58:00Z)
- Goal of the change:
  - add bounded global skills `g-grill`, `g-prd`, `g-issues`, and `g-refactor`, then wire minimal discoverability/static validation around them
- Files changed and why:
  - `packages/pi-g-skills/skills/g-grill/SKILL.md`
    - added a Pi-native mutual-understanding/clarification skill with a bounded output contract
  - `packages/pi-g-skills/skills/g-prd/SKILL.md`
    - added a PRD synthesis skill with required PRD sections
  - `packages/pi-g-skills/skills/g-issues/SKILL.md`
    - added a vertical-slice backlog planning skill with HITL/AFK classification and dependency/proof expectations
  - `packages/pi-g-skills/skills/g-refactor/SKILL.md`
    - added a deep-module refactor-planning skill using interface/seam/deletion-test/dependency-category vocabulary
  - `packages/pi-g-skills/README.md`
    - documented the new global skills in the package overview and package contents
  - `packages/pi-g-skills/docs/porting-matrix.md`
    - added a Pi-native global additions section for the new skills
  - `.pi/agent/docs/product_planning_workflow.md`
    - updated the workflow doc to point to the new global `g-grill`, `g-prd`, and `g-issues` skill ports
  - `.pi/agent/docs/deep_module_refactoring_workflow.md`
    - updated the workflow doc to point to the new global `g-refactor` skill
  - `.pi/agent/extensions/g-skill-auto-route.ts`
    - extended explicit `/skill:` preservation to recognize the new global skills
  - `scripts/validate-skill-routing.sh`
    - added the new skills to the loaded skill set and helper coverage for explicit `/skill:g-grill`, `/skill:g-prd`, `/skill:g-issues`, and `/skill:g-refactor`
  - `scripts/check-repo-static.sh`
    - added required-file and discoverability assertions for the new skill files/package docs/workflow docs
  - `logs/CURRENT.md`, paired planning/coding logs
    - repointed the active log set for this bounded slice and recorded evidence
- Tests added or changed:
  - static contract expanded in `scripts/check-repo-static.sh`
  - skill-routing helper contract expanded in `scripts/validate-skill-routing.sh`
  - no new `tests/` file was necessary because the repo already treats these scripts as the deterministic public validation surface for skill/discoverability changes
- Exact RED command and key failure reason:
  - `cd /Users/subhajlimanond/dev/ma-code-worktrees/task-1777913405704-global-skills && bash scripts/check-repo-static.sh`
  - failed for the right reason because the newly required global skill file did not exist yet:
    - `Missing required file: packages/pi-g-skills/skills/g-grill/SKILL.md`
- Exact GREEN command:
  - `cd /Users/subhajlimanond/dev/ma-code-worktrees/task-1777913405704-global-skills && bash scripts/check-repo-static.sh`
- Other validation commands run:
  - `cd /Users/subhajlimanond/dev/ma-code-worktrees/task-1777913405704-global-skills && bash scripts/validate-skill-routing.sh --skip-live --report /tmp/global-skills-routing-green.md --summary-json /tmp/global-skills-routing-green.json`
  - `cd /Users/subhajlimanond/dev/ma-code-worktrees/task-1777913405704-global-skills && bash scripts/validate-skill-routing.sh --skip-live --report /tmp/global-skills-routing-flake2.md --summary-json /tmp/global-skills-routing-flake2.json`
  - `cd /Users/subhajlimanond/dev/ma-code-worktrees/task-1777913405704-global-skills && bash scripts/validate-skill-routing.sh --skip-live --report /tmp/global-skills-routing-flake3.md --summary-json /tmp/global-skills-routing-flake3.json`
  - `cd /Users/subhajlimanond/dev/ma-code-worktrees/task-1777913405704-global-skills && bash scripts/check-repo-static.sh` (three consecutive PASS runs total after implementation)
  - `cd /Users/subhajlimanond/dev/ma-code-worktrees/task-1777913405704-global-skills && git diff --check`
- Wiring verification evidence:
  - `.pi/settings.json` already loads `../packages/pi-g-skills/skills`, so the new package skill directories become globally discoverable without additional settings changes
  - `g-skill-auto-route.ts` now recognizes explicit `/skill:` commands for the new skill names instead of dropping them as unknown
  - `validate-skill-routing.sh --skip-live` now loads the new skill directories and proves explicit `/skill:` preservation for all four new skills
- Behavior changes and risk notes:
  - this slice adds global skill ports and discoverability checks only; it does not add Graphify runtime integration or repo-local prompt automation for these skills
  - auto-route heuristics were not broadened semantically for the new skills; only explicit `/skill:` recognition was extended to keep routing conservative
- Follow-ups or known gaps:
  - if operators want semantic auto-routing into `g-grill`, `g-prd`, `g-issues`, or `g-refactor`, add that later as a separate routing-policy slice with its own false-positive review
  - live skill-routing probes were intentionally skipped in this slice; helper-level and compile/static coverage were sufficient for the bounded change

## Review (2026-05-04T16:58:28Z) - working-tree

### Reviewed
- Repo: `/Users/subhajlimanond/dev/ma-code-worktrees/task-1777913405704-global-skills`
- Branch: `split/task-1777913405704-global-skills`
- Scope: `working-tree`
- Commands Run:
  - `git status --porcelain=v1`
  - `git branch --show-current`
  - `git diff --stat`
  - `git diff -- packages/pi-g-skills/README.md packages/pi-g-skills/docs/porting-matrix.md packages/pi-g-skills/skills/g-grill/SKILL.md packages/pi-g-skills/skills/g-prd/SKILL.md packages/pi-g-skills/skills/g-issues/SKILL.md packages/pi-g-skills/skills/g-refactor/SKILL.md`
  - `git diff -- .pi/agent/extensions/g-skill-auto-route.ts scripts/validate-skill-routing.sh scripts/check-repo-static.sh .pi/agent/docs/product_planning_workflow.md .pi/agent/docs/deep_module_refactoring_workflow.md`
  - `bash scripts/check-repo-static.sh`
  - `bash scripts/validate-skill-routing.sh --skip-live --report /tmp/global-skills-routing-flake3.md --summary-json /tmp/global-skills-routing-flake3.json`
  - `git diff --check`

### Findings
CRITICAL
- none

HIGH
- none

MEDIUM
- none

LOW
- The new skills are globally installable and explicitly invokable, but this slice intentionally did not add semantic auto-route heuristics for them. That keeps false positives low, but operators must use explicit `/skill:g-grill`, `/skill:g-prd`, `/skill:g-issues`, or `/skill:g-refactor` until a later routing slice broadens detection.

### Open Questions / Assumptions
- Assumption: explicit `/skill:` support is sufficient for the first bounded global-skill landing and safer than adding new semantic routing heuristics immediately.
- Assumption: repo-root discoverability for the new skills is adequately covered by the package README, porting matrix, workflow docs, static checker, and skill-routing validator without changing repo-local role prompts in this slice.

### Recommended Tests / Validation
- `bash scripts/check-repo-static.sh` (3 consecutive PASS runs)
- `bash scripts/validate-skill-routing.sh --skip-live --report /tmp/global-skills-routing-flake3.md --summary-json /tmp/global-skills-routing-flake3.json` (3 consecutive PASS runs total)
- `git diff --check`

### Rollout Notes
- Global skill users can invoke the new skills immediately after installing/updating `packages/pi-g-skills`.
- Semantic auto-routing for the new skills should remain an explicit future decision rather than an implicit consequence of this slice.

Review Verdict: no_required_fixes
