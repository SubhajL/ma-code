# Coding Log — skill-route-keywords

- Date: 2026-05-04
- Scope: Add semantic auto-route keywords for new global skills.
- Status: in_progress
- Branch: `split/task-1777953714017-skill-route-keywords`
- Task: `task-1777953714017`
- Related planning log: `reports/planning/2026-05-04_skill-route-keywords-plan.md`

## Discovery Path
- Read `AGENTS.md`, `README.md`, `logs/CURRENT.md`, and `packages/pi-g-skills/skills/g-coding/SKILL.md`.
- Attempted Auggie first for bounded discovery; it timed out.
- Used local fallback to inspect `.pi/agent/extensions/g-skill-auto-route.ts` and `scripts/validate-skill-routing.sh`.

## TDD Plan
- First tracer-bullet behavior: semantic route validation fails once new keyword-based expectations are added for `g-grill`, `g-prd`, `g-issues`, and `g-refactor`, because the auto-router does not yet recognize those intents.
- Public interface: `detectSkillRoute(...)` as exercised through `bash scripts/validate-skill-routing.sh --skip-live`.
- Boundary dependencies/mock plan: helper-level route classification only; no provider-backed live probes for this bounded slice.
- Out of scope: broader prompt/doc updates, live route probes, and Graphify/runtime changes.

## Work Summary (2026-05-04T17:05:00Z)
- Goal of the change:
  - add semantic auto-route keywords for the four new global skills while keeping the slice bounded to routing/validation surfaces
- Files changed and why:
  - `.pi/agent/extensions/g-skill-auto-route.ts`
    - added semantic keyword patterns for `g-grill`, `g-prd`, `g-issues`, and `g-refactor`
    - moved `refactor` intent out of `g-coding` so refactor requests can route to `g-refactor`
  - `scripts/validate-skill-routing.sh`
    - added helper-level keyword route expectations for brainstorm/research, PRD/spec, backlog/tasks, and refactor/deep-module prompts
  - `logs/CURRENT.md`
    - repointed the active logs to this bounded routing-keyword slice
  - paired planning/coding logs
    - recorded RED/GREEN evidence and review
- Tests added or changed:
  - no standalone `tests/` file was needed
  - expanded the public routing validator’s helper cases to cover new semantic keyword prompts for the four new skills
- Exact RED command and key failure reason:
  - `cd /Users/subhajlimanond/dev/ma-code-worktrees/task-1777953714017-skill-route-keywords && bash scripts/validate-skill-routing.sh --skip-live --report /tmp/skill-route-keywords-red.md --summary-json /tmp/skill-route-keywords-red.json`
  - failed for the right reason because the router did not yet recognize semantic keyword prompts such as `brainstorm some product options before we commit`
- Exact GREEN command:
  - `cd /Users/subhajlimanond/dev/ma-code-worktrees/task-1777953714017-skill-route-keywords && bash scripts/validate-skill-routing.sh --skip-live --report /tmp/skill-route-keywords-green1.md --summary-json /tmp/skill-route-keywords-green1.json`
- Other validation commands run:
  - `cd /Users/subhajlimanond/dev/ma-code-worktrees/task-1777953714017-skill-route-keywords && bash scripts/validate-skill-routing.sh --skip-live --report /tmp/skill-route-keywords-green2.md --summary-json /tmp/skill-route-keywords-green2.json`
  - `cd /Users/subhajlimanond/dev/ma-code-worktrees/task-1777953714017-skill-route-keywords && bash scripts/validate-skill-routing.sh --skip-live --report /tmp/skill-route-keywords-green3.md --summary-json /tmp/skill-route-keywords-green3.json`
  - `cd /Users/subhajlimanond/dev/ma-code-worktrees/task-1777953714017-skill-route-keywords && git diff --check`
- Wiring verification evidence:
  - `validate-skill-routing.sh` compiles `g-skill-auto-route.ts` in its isolated runtime and proves `detectSkillRoute(...)` classification through helper-level route cases
  - the new skills already existed in the explicit skill list; this slice extends semantic routing only, so no settings/package changes were required
- Behavior changes and risk notes:
  - prompts containing brainstorm/research/clarify-style language can now route to `g-grill`
  - PRD/spec prompts can now route to `g-prd`
  - backlog/task-splitting prompts can now route to `g-issues`
  - refactor/deep-module prompts can now route to `g-refactor` instead of `g-coding`
- Follow-ups or known gaps:
  - live provider-backed route probes remain intentionally skipped in this bounded slice
  - broad words like `research`, `backlog`, or `refactor` are now semantically meaningful in routing; if this proves too eager in practice, tune with narrower phrase constraints in a follow-up slice

## Review (2026-05-05T04:05:06Z) - working-tree

### Reviewed
- Repo: `/Users/subhajlimanond/dev/ma-code-worktrees/task-1777953714017-skill-route-keywords`
- Branch: `split/task-1777953714017-skill-route-keywords`
- Scope: `working-tree`
- Commands Run:
  - `git status --porcelain=v1`
  - `git diff --stat`
  - `git diff -- .pi/agent/extensions/g-skill-auto-route.ts scripts/validate-skill-routing.sh`
  - `bash scripts/validate-skill-routing.sh --skip-live --report /tmp/skill-route-keywords-green3.md --summary-json /tmp/skill-route-keywords-green3.json`
  - `git diff --check`

### Findings
CRITICAL
- none

HIGH
- none

MEDIUM
- none

LOW
- The new keyword set intentionally treats broad words like `research`, `backlog`, and `refactor` as routing hints. That matches the requested behavior, but it may prove slightly eager in some mixed-intent prompts. If operators report false positives, tighten those specific patterns in a follow-up slice rather than widening the current change.

### Open Questions / Assumptions
- Assumption: routing `refactor` to `g-refactor` is desired even when the eventual next step may be implementation, because the user explicitly requested `g-refactor: refactor, etc`.
- Assumption: helper-level routing proof plus compile coverage is sufficient for this bounded router slice; live probes remain optional.

### Recommended Tests / Validation
- `bash scripts/validate-skill-routing.sh --skip-live --report /tmp/skill-route-keywords-green3.md --summary-json /tmp/skill-route-keywords-green3.json`
- `git diff --check`

### Rollout Notes
- The change affects semantic auto-routing only; explicit `/skill:` invocation remains available as an operator escape hatch.
- If routing feels too eager after use, tune individual keyword patterns rather than rolling back all four skills.

Review Verdict: no_required_fixes
