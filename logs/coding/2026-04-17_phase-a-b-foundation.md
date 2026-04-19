# Coding Log — Phase A/B Foundation Hardening

- Date: 2026-04-17
- Scope: harness investigation, Phase A/B implementation, and bounded runtime validation
- Status: implementation and validation complete for Phase A/B v1
- Branch: `ma-code/logs-planning-20260417`

## Task Group
- verify current harness assets
- identify missing pieces from starter pack to operable Pi harness
- produce concrete Phase A and Phase B checklist
- prepare runtime-first order for:
  - config verification
  - AGENTS finalization
  - role contract finalization
  - `safe-bash.ts`
  - `till-done.ts`

## Files Investigated
- `AGENTS.md`
- `SYSTEM.md`
- `README.md`
- `.pi/agent/docs/*`
- `.pi/agent/extensions/*.spec.md`
- `.pi/agent/models.json`
- `.pi/agent/settings.json`
- `.pi/agent/prompts/roles/*.md`
- `.pi/agent/prompts/templates/*.md`
- `.pi/agent/routing/*`
- `.pi/agent/skills/*/SKILL.md`
- `.pi/agent/state/schemas/*.json`
- `.pi/agent/state/runtime/*.json`
- `.pi/agent/teams/*.yaml`
- root planning/backlog docs:
  - `pi_gpt54_first_implementation_summary_REPO_LOCAL.md`
  - `pi_harness_implementation_backlog_REPO_LOCAL.md`
  - `pi_multi_agent_build_plan_layman_REPO_LOCAL.md`
  - `pi_multi_agent_prompts_and_model_routing_REPO_LOCAL.md`
- Pi runtime docs and examples under:
  - `/opt/homebrew/Cellar/pi-coding-agent/0.67.3/libexec/lib/node_modules/@mariozechner/pi-coding-agent/docs`
  - `/opt/homebrew/Cellar/pi-coding-agent/0.67.3/libexec/lib/node_modules/@mariozechner/pi-coding-agent/examples`

## Runtime Verification Findings
- `pi --version` returned `0.67.3`
- `pi --list-models` confirmed exact runnable IDs are available
- verified examples include:
  - `openai-codex/gpt-5.4`
  - `openai-codex/gpt-5.4-mini`
  - `anthropic/claude-opus-4-5`
  - `anthropic/claude-sonnet-4-6`
  - `github-copilot/gpt-5.4`
  - `github-copilot/gpt-5.4-mini`

## Key Findings
- current repo is a strong starter pack, not an operable runtime harness yet
- `AGENTS.md` is already strong and close to final v1 policy
- role prompts and templates are usable but need tighter output contracts
- `.pi/agent/models.json` is an internal routing map, not Pi runtime `models.json`
- `.pi/agent/settings.json` is not real Pi project settings
- Pi expects:
  - `.pi/settings.json`
  - `.pi/SYSTEM.md`
  - `.pi/extensions/*.ts` or configured extension paths
- current task state has a schema/runtime mismatch:
  - schema expects object
  - runtime file is `[]`
- first runtime targets remain correct:
  - `safe-bash.ts`
  - `till-done.ts`

## Missing Pieces Identified
- real Pi project config at `.pi/settings.json`
- runtime system prompt at `.pi/SYSTEM.md`
- exact verified provider/model mapping
- final AGENTS protected-path and approval wording
- finalized role output contracts
- corrected task-state schema semantics
- live runtime extensions:
  - `.pi/agent/extensions/safe-bash.ts`
  - `.pi/agent/extensions/till-done.ts`
- task mutation tool:
  - `task_update`
- minimal audit logging

## Recommended Order
1. create real `.pi/settings.json`
2. create real `.pi/SYSTEM.md`
3. normalize `.pi/agent/models.json` to exact runnable IDs
4. finalize `AGENTS.md`
5. finalize role output contracts
6. fix `tasks.schema.json` and `tasks.json`
7. implement `safe-bash.ts`
8. implement `till-done.ts`
9. run smoke tests for both extensions

## Evidence Produced
- full repo file inventory
- Pi runtime model listing
- Pi docs/examples review for extensions, settings, models, skills, templates, SDK
- concrete checklist drafted for Phase A and Phase B
- precise patch-plan sequence drafted for the existing repo
- Patch Set 1 implemented:
  - created `.pi/settings.json`
  - created `.pi/SYSTEM.md`
- Patch Set 1 validation:
  - `.pi/settings.json` parsed successfully as JSON
  - confirmed existence of `.pi/SYSTEM.md`
  - confirmed configured resource directories exist:
    - `.pi/agent/extensions`
    - `.pi/agent/skills`
    - `.pi/agent/prompts/templates`
  - re-checked `pi --list-models`; chosen IDs remain present in the runtime listing
- Patch Set 2 implemented:
  - normalized `.pi/agent/models.json` to exact verified IDs
  - normalized `.pi/agent/routing/worker_routing_matrix.md` to match
- Patch Set 2 validation:
  - `.pi/agent/models.json` parsed successfully as JSON
  - routing map contains 12 roles
  - markdown and JSON routing files now use exact runnable IDs
- Patch Set 3 implemented:
  - finalized `AGENTS.md` with protected paths, human approval rules, main-branch mutation policy, and stronger task-discipline wording
- Patch Set 3 validation:
  - confirmed `AGENTS.md` includes:
    - protected path policy
    - human approval section
    - no tracked-file mutation on `main`
    - active-task linkage rule
    - recorded-evidence completion rule
- Patch Set 4 implemented:
  - finalized role output contracts across all 12 role prompt files
  - added shared output-contract rules to every role
  - added explicit decision/status lines where needed
- Patch Set 4 validation:
  - confirmed all role files include `Output contract rules:`
  - confirmed explicit decision lines in orchestrator, quality lead, reviewer, validator, and recovery
  - confirmed explicit status lines in frontend, backend, and infra workers
- Patch Set 5 implemented:
  - corrected task-state schema semantics in `.pi/agent/state/schemas/tasks.schema.json`
  - replaced raw-array runtime state with canonical top-level task state in `.pi/agent/state/runtime/tasks.json`
- Patch Set 5 validation:
  - both task schema and runtime state parse successfully as JSON
  - runtime task state now exposes `version`, `activeTaskId`, and `tasks`
  - task state shape is now suitable for `task_update`
- Patch Set 6 implemented:
  - created `.pi/agent/extensions/safe-bash.ts`
  - added `tool_call` interception for `bash`, `write`, and `edit`
  - added protected-path blocking, main-branch mutation blocking, risk classification, and audit logging
- Patch Set 6 validation:
  - confirmed `safe-bash.ts` contains:
    - `withFileMutationQueue`
    - `tool_call` interception
    - main-branch mutation guard
    - risky-command confirmation path
    - non-interactive fail-closed path
- Patch Set 7 implemented:
  - created `.pi/agent/extensions/till-done.ts`
  - registered `task_update`
  - added task-state reads/writes with `withFileMutationQueue`
  - added mutation blocking for `write`, `edit`, and mutating `bash` when no active runnable task exists
  - added evidence-before-done enforcement and `agent_end` active-task reminders
- Patch Set 7 validation:
  - confirmed `till-done.ts` contains:
    - `task_update` tool registration
    - `withFileMutationQueue`
    - mutation-blocking message for missing active task
    - evidence-before-done enforcement
    - `agent_end` active-task handling

## Runtime Validation Evidence
- end-to-end Pi runtime check succeeded:
  - `pi --no-session -p "Reply with exactly OK."` returned `OK`
- project config/resource discovery succeeded:
  - RPC `get_commands` returned all project prompt templates and both project skills from `.pi/agent/skills`
- custom tool availability succeeded in a live Pi session:
  - `task_update` was invoked through Pi with `action: show`
  - returned `activeTaskId: null`, `activeTask: null`, `tasks: []`
- TypeScript compile check succeeded in an isolated temporary sandbox:
  - ephemeral `npm install` with `@mariozechner/pi-coding-agent@0.67.3`, `@mariozechner/pi-ai@0.67.3`, `@sinclair/typebox`, `typescript`, `@types/node`
  - `npx tsc --noEmit --skipLibCheck --moduleResolution nodenext --module nodenext --target es2022 --lib es2022,dom --types node src/safe-bash.ts src/till-done.ts`
  - result: `TSC_CHECK=PASS`
- `safe-bash.ts` behavioral validation succeeded in isolated Pi runs:
  - safe command allowed:
    - `bash` tool executed `pwd`
    - tool result returned `/Users/subhajlimanond/dev/ma-code`
  - protected write blocked via `write` tool in a disposable temp dir:
    - attempted `.env` write returned `Blocked write: secret/env files are protected`
  - protected write blocked via `bash` tool in a disposable temp dir:
    - attempted `echo TEST=1 > .env`
    - `tool_execution_end` returned `isError: true`
    - block reason: `Blocked bash command: .env write detected`
  - destructive git reset blocked on non-main branch in a disposable temp repo:
    - `bash` tool executed with `git reset --hard HEAD`
    - `tool_execution_end` returned `isError: true`
    - exact block reason: `Blocked bash command: destructive git reset is blocked`
- `till-done.ts` behavioral validation succeeded in isolated Pi runs:
  - direct mutation without task was blocked in a disposable temp dir:
    - attempted direct `write` returned `Mutating actions require an active task in \`in_progress\` status with an owner and acceptance criteria.`
  - evidence-before-done was enforced in a disposable temp dir:
    - after create/claim/start, `task_update(done, ...)` returned `Task cannot be completed without evidence.`
- full-stack interaction with both runtime controls loaded succeeded:
  - Pi used `task_update` and `write` to create a bounded validation artifact task
  - evidence was attached and the task was completed through `task_update`
  - post-validation cleanup completed:
    - removed `validation-artifact.txt`
    - reset `.pi/agent/state/runtime/tasks.json` to the initial empty state
- repeatable validation assets were added:
  - automated script: `scripts/validate-phase-a-b.sh`
  - runbook: `.pi/agent/docs/runtime_validation_runbook.md`
  - operator workflow: `.pi/agent/docs/operator_workflow.md`
  - validation report: `reports/validation/2026-04-17_phase-a-b-runtime-validation.md`
  - automated validation report: `reports/validation/2026-04-17_phase-a-b-runtime-validation-script.md`
  - automated validation summary: `reports/validation/2026-04-17_phase-a-b-runtime-validation-script.json`
- validator wiring into harness docs completed:
  - README updated with validation workflow entrypoint
  - file map updated with validator and validation outputs
  - logging convention updated to include validation reports and validator automation
- automated validator execution succeeded:
  - `./scripts/validate-phase-a-b.sh`
  - result: PASS

## Known Risks
- repo-root git repository is broader than `dev/ma-code`; care is needed to avoid unrelated changes
- current branch was `main`; a bounded branch was created before saving files
- routing docs contain historical contradictions; one canonical policy must be selected during implementation

## Decisions Made
- optimized next move selected: precise patch plan before generating implementation file contents
- patch order locked as:
  1. Pi-native wiring
  2. routing normalization
  3. AGENTS finalization
  4. role output contracts
  5. task schema/runtime correction
  6. `safe-bash.ts`
  7. `till-done.ts`

## Current Outcome
- investigation complete
- coding log saved
- planning log saved
- precise patch plan saved
- Patch Set 1 applied successfully
- Patch Set 2 applied successfully
- Patch Set 3 applied successfully
- Patch Set 4 applied successfully
- Patch Set 5 applied successfully
- Patch Set 6 applied successfully
- Patch Set 7 applied successfully
- bounded runtime validation completed
- repeatable validation runbook, automated validation script, operator workflow doc, validation report, and JSON summary added
- validator is now wired into repo docs and operator workflow
- the previously noted validation gaps are closed for a first v1 pass
- first foundation hardening and first runtime control implementation pass are now in place
