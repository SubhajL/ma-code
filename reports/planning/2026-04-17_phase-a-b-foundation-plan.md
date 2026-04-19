# Planning Log — Phase A/B Foundation Plan

- Date: 2026-04-17
- Scope: foundation hardening and first runtime controls
- Status: validated for Phase A/B v1
- Related coding log: `logs/coding/2026-04-17_phase-a-b-foundation.md`

## Phase A Plan

### A1. Create real Pi project config
**Files**
- `.pi/settings.json`

**Purpose**
- actual Pi project settings
- wire repo-local extensions, skills, and templates
- set verified model defaults

**Planned contents**
- `defaultProvider`: `openai-codex`
- `defaultModel`: `gpt-5.4`
- `defaultThinkingLevel`: `medium`
- `enabledModels` with exact runnable IDs
- resource paths:
  - `agent/extensions`
  - `agent/skills`
  - `agent/prompts/templates`

**Must not contain**
- harness prose
- role definitions
- UI status notes

**Acceptance**
- Pi loads project settings successfully
- resource paths resolve
- default model IDs are runnable

---

### A2. Create runtime system prompt
**Files**
- `.pi/SYSTEM.md`

**Purpose**
- real Pi system prompt override

**Planned contents**
- runtime-first priorities
- minimal/testable bias
- structure expectations
- no redesigning
- no bypassing runtime safety

**Must not contain**
- role definitions
- routing matrix
- extension implementation details

**Acceptance**
- Pi loads `.pi/SYSTEM.md`
- runtime instructions match project intent

---

### A3. Normalize internal routing map
**Files**
- `.pi/agent/models.json`
- `.pi/agent/routing/worker_routing_matrix.md`

**Purpose**
- one canonical routing policy using exact runnable IDs

**Planned contents**
- `openai-codex/gpt-5.4`
- `openai-codex/gpt-5.4-mini`
- `anthropic/claude-opus-4-5`
- `anthropic/claude-sonnet-4-6`

**Must not contain**
- placeholder title-case names like `GPT-5.4`
- conflicting alternative routing recommendations

**Acceptance**
- all role mappings use exact runnable IDs
- docs and JSON agree

---

### A4. Finalize AGENTS contract
**Files**
- `AGENTS.md`

**Purpose**
- final v1 repo operating contract

**Planned additions**
- explicit protected paths
- human approval rules
- active-task-before-mutation rule
- evidence-before-complete rule
- runtime-state direct-edit restriction

**Must not contain**
- model routing table
- extension internals

**Acceptance**
- enforceable and concise
- matches intended runtime controls

---

### A5. Finalize role output contracts
**Files**
- `.pi/agent/prompts/roles/*.md`

**Purpose**
- stable structured outputs before orchestration logic

**Planned changes**
- add exact output-contract rules to all role files
- add explicit decision lines for:
  - orchestrator
  - quality lead
  - reviewer
  - validator
  - recovery
- add `Status:` line for domain workers

**Must not contain**
- task JSON semantics
- runtime enforcement logic

**Acceptance**
- every role returns predictable sections
- validator/reviewer/recovery outputs are decision-friendly

---

### A6. Fix task state schema semantics
**Files**
- `.pi/agent/state/schemas/tasks.schema.json`
- `.pi/agent/state/runtime/tasks.json`

**Purpose**
- provide coherent file-backed task state for `till-done.ts`

**Planned state shape**
- top-level object
- `version`
- `activeTaskId`
- `tasks[]`

**Must not contain**
- queue-runner logic
- UI state

**Acceptance**
- runtime file matches schema
- shape supports `task_update`

## Phase B Plan

### B1. Implement `safe-bash.ts`
**Files**
- `.pi/agent/extensions/safe-bash.ts`

**Purpose**
- first runtime safety gate

**Planned logic**
- intercept `bash` tool calls
- classify command risk: allow / warn / block
- block hard-dangerous commands
- require interactive confirmation for warn-level commands
- block warn-level commands when no UI exists
- block direct `write`/`edit` to protected paths
- block mutating tool actions on `main`
- append audit entries to `logs/harness-actions.jsonl`

**Must not contain**
- task workflow logic
- queue logic

**Acceptance**
- dangerous deletion blocked
- destructive git actions blocked
- `.env` and runtime-state writes blocked
- warn-level commands require confirmation or fail closed

---

### B2. Implement `till-done.ts`
**Files**
- `.pi/agent/extensions/till-done.ts`
- `.pi/agent/state/runtime/tasks.json`

**Purpose**
- enforce task discipline before mutations

**Planned logic**
- register `task_update` tool
- actions:
  - `show`
  - `create`
  - `claim`
  - `start`
  - `note`
  - `evidence`
  - `review`
  - `block`
  - `done`
  - `fail`
- require active task in `in_progress` before:
  - `edit`
  - `write`
  - mutating `bash`
- require acceptance criteria before task start
- require evidence before `done`
- keep blocked tasks visible
- log lifecycle events to `logs/harness-actions.jsonl`

**Must not contain**
- queue runner
- widgets
- routing logic

**Acceptance**
- mutation without active task is blocked
- completion without evidence is rejected
- task state persists on disk

## File-by-File Breakdown

### `.pi/settings.json`
- exists to make the repo Pi-runnable
- should hold only real Pi settings
- depends on exact model/provider verification

### `.pi/SYSTEM.md`
- exists because stock Pi reads this path
- should hold compact runtime guidance only
- must stay aligned with root `SYSTEM.md`

### `.pi/agent/models.json`
- exists as internal harness routing map
- should document exact runnable IDs per role
- should not pretend to be Pi provider config

### `AGENTS.md`
- exists as repo operating contract
- should define what runtime controls are expected to enforce
- should not include implementation details

### `.pi/agent/prompts/roles/*.md`
- exist to shape consistent worker and lead behavior
- should define inputs, outputs, evidence, and escalation
- should not contain persistence rules

### `.pi/agent/state/schemas/tasks.schema.json`
- exists to define task state semantics
- should match runtime storage exactly
- should not include queue or UI semantics

### `.pi/agent/extensions/safe-bash.ts`
- exists to enforce shell safety at runtime
- should fail closed in non-interactive risky cases
- should not manage tasks

### `.pi/agent/extensions/till-done.ts`
- exists to enforce task ownership and evidence
- should be the normal task mutation path via tool
- should not become a queue or UI system

## Acceptance Criteria
- Pi-native project wiring exists and is valid
- exact model IDs are normalized
- AGENTS is final enough for runtime enforcement
- role outputs are stable and structured
- task schema and runtime state are coherent
- `safe-bash.ts` and `till-done.ts` can be smoke-tested against expected block/allow flows

## Likely Failure Modes
- using `.pi/agent/settings.json` as if Pi reads it directly
- relying on repo-root `SYSTEM.md` only
- leaving routing contradictions unresolved
- implementing `till-done.ts` before task schema cleanup
- overblocking normal work in `safe-bash.ts`
- allowing raw task JSON edits to become the normal workflow
- file-backed task state corruption if mutation windows are not serialized

## Precise Patch Plan Chosen
The next optimized step is a precise file-edit patch plan before generating final implementation patches.

### Patch Set 1 — Pi-native project wiring
Files:
- create `.pi/settings.json`
- create `.pi/SYSTEM.md`

Actions:
- add real Pi project settings
- point Pi at existing repo-local paths under `.pi/agent/`
- set exact runnable defaults using verified provider/model IDs
- install runtime system prompt at the Pi-native path

Status:
- applied

Implementation notes:
- `.pi/settings.json` now points Pi at:
  - `agent/extensions`
  - `agent/skills`
  - `agent/prompts/templates`
- `.pi/SYSTEM.md` now exists as the real Pi system-prompt override path

Validation:
- `.pi/settings.json` parsed successfully as JSON
- confirmed existence of `.pi/SYSTEM.md`
- confirmed configured resource directories exist
- re-checked `pi --list-models`; referenced IDs remain present in the runtime listing

### Patch Set 2 — Canonical routing normalization
Files:
- edit `.pi/agent/models.json`
- edit `.pi/agent/routing/worker_routing_matrix.md`

Actions:
- convert placeholder provider/model labels to exact runnable IDs
- remove contradictory routing wording
- keep `.pi/agent/models.json` clearly labeled as internal harness routing, not Pi provider config

Status:
- applied

Implementation notes:
- `.pi/agent/models.json` now identifies itself as an internal routing map
- provider/model entries now use exact verified IDs
- `.pi/agent/routing/worker_routing_matrix.md` now matches the JSON routing map

Validation:
- `.pi/agent/models.json` parsed successfully as JSON
- routing map contains 12 roles
- markdown matrix and JSON routing map now use exact runnable IDs

### Patch Set 3 — Finalize repo operating contract
Files:
- edit `AGENTS.md`

Actions:
- add explicit protected paths
- add human approval rules
- add active-task-before-mutation and evidence-before-complete policy lines
- add direct runtime-state edit restriction

Status:
- applied

Implementation notes:
- `AGENTS.md` now explicitly protects `.env*`, `.git/`, `node_modules/`, and `.pi/agent/state/runtime/`
- `AGENTS.md` now blocks tracked-file mutation on `main` at policy level
- human approval cases are now listed explicitly
- task-discipline wording now requires active task linkage and recorded evidence

Validation:
- required policy lines are present in `AGENTS.md`
- policy remains concise and aligned with planned runtime controls

### Patch Set 4 — Finalize role output contracts
Files:
- edit `.pi/agent/prompts/roles/orchestrator.md`
- edit `.pi/agent/prompts/roles/planning_lead.md`
- edit `.pi/agent/prompts/roles/build_lead.md`
- edit `.pi/agent/prompts/roles/quality_lead.md`
- edit `.pi/agent/prompts/roles/research_worker.md`
- edit `.pi/agent/prompts/roles/frontend_worker.md`
- edit `.pi/agent/prompts/roles/backend_worker.md`
- edit `.pi/agent/prompts/roles/infra_worker.md`
- edit `.pi/agent/prompts/roles/reviewer_worker.md`
- edit `.pi/agent/prompts/roles/validator_worker.md`
- edit `.pi/agent/prompts/roles/docs_worker.md`
- edit `.pi/agent/prompts/roles/recovery_worker.md`

Actions:
- add shared output-contract rules
- add explicit decision or status lines where needed
- keep section headers stable and parse-friendly

Status:
- applied

Implementation notes:
- all role files now include shared output-contract rules
- explicit decision lines were added to orchestrator, quality lead, reviewer, validator, and recovery
- explicit status lines were added to frontend, backend, and infra workers
- section headers remain stable and compact

Validation:
- all role files include `Output contract rules:`
- orchestrator, quality lead, reviewer, validator, and recovery now include explicit decision lines
- frontend, backend, and infra workers now include explicit status lines

### Patch Set 5 — Correct task-state semantics
Files:
- edit `.pi/agent/state/schemas/tasks.schema.json`
- edit `.pi/agent/state/runtime/tasks.json`

Actions:
- replace array/object mismatch with one canonical top-level task state object
- add `version`, `activeTaskId`, and `tasks[]`
- keep queue files unchanged for now

Status:
- applied

Implementation notes:
- task state is now a top-level object instead of a raw task item shape
- runtime state now initializes with `version`, `activeTaskId`, and `tasks`
- schema now supports null `owner` and null `activeTaskId`
- field naming normalized to `retryCount`

Validation:
- both schema and runtime files parse successfully as JSON
- runtime file now exposes keys: `version`, `activeTaskId`, `tasks`
- task state shape is now suitable for `task_update`

### Patch Set 6 — Implement `safe-bash.ts`
Files:
- create `.pi/agent/extensions/safe-bash.ts`

Actions:
- intercept `bash` tool calls and classify risk
- block destructive patterns
- block direct protected-path writes via `write` and `edit`
- block mutating actions on `main`
- warn/confirm medium-risk commands only when UI exists
- fail closed in non-interactive risky cases
- append audit lines to `logs/harness-actions.jsonl`

Status:
- applied

Implementation notes:
- `safe-bash.ts` now intercepts `tool_call`
- hard-block patterns include destructive deletion, destructive git history actions, force push, sudo, and dangerous chmod/chown cases
- protected-path blocking now applies to `write` and `edit`
- mutating `bash` commands and file mutations are blocked on `main`
- warn-level commands require confirmation when UI exists and fail closed otherwise
- audit entries append to `logs/harness-actions.jsonl`

Validation:
- `safe-bash.ts` file created successfully
- spot checks confirm presence of:
  - `withFileMutationQueue`
  - `tool_call` interception
  - main-branch mutation guard
  - risky-command confirmation path
  - non-interactive fail-closed path

### Patch Set 7 — Implement `till-done.ts`
Files:
- create `.pi/agent/extensions/till-done.ts`

Actions:
- register `task_update` tool
- enforce active task before mutating `write`, `edit`, and mutating `bash`
- require acceptance criteria before task start
- require evidence before `done`
- keep blocked tasks visible
- log task lifecycle activity to `logs/harness-actions.jsonl`

Status:
- applied

Implementation notes:
- `till-done.ts` now registers `task_update`
- task state is read from and written to `.pi/agent/state/runtime/tasks.json`
- state mutation uses `withFileMutationQueue`
- mutating `write`, `edit`, and mutating `bash` are blocked unless there is an active runnable task
- task start requires both acceptance criteria and an owner
- completion without evidence is rejected
- active-task reminders are emitted on `agent_end`

Validation:
- `till-done.ts` file created successfully
- spot checks confirm presence of:
  - `task_update` tool registration
  - `withFileMutationQueue`
  - mutation-blocking message for missing active task
  - evidence-before-done enforcement
  - `agent_end` active-task handling

## Validation Follow-up
- bounded runtime validation completed after Patch Sets 1-7
- project prompt templates and skills were confirmed through Pi RPC `get_commands`
- `task_update` custom tool was confirmed in a live Pi session
- `safe-bash.ts` was validated for:
  - safe `pwd` execution
  - blocked `.env` write through `write`
  - blocked `.env` write through `bash`
  - blocked destructive `git reset --hard HEAD` on a disposable non-main branch
- `till-done.ts` was validated for:
  - blocked direct write without an active task
  - rejection of `done` without evidence
- TypeScript compile check passed in an isolated temporary sandbox
- repeatability assets created:
  - `.pi/agent/docs/runtime_validation_runbook.md`
  - `.pi/agent/docs/operator_workflow.md`
  - `scripts/validate-phase-a-b.sh`
  - `reports/validation/2026-04-17_phase-a-b-runtime-validation.md`
  - `reports/validation/2026-04-17_phase-a-b-runtime-validation-script.md`
  - `reports/validation/2026-04-17_phase-a-b-runtime-validation-script.json`
- validator is now wired into harness docs through:
  - `README.md`
  - `.pi/agent/docs/file_map.md`
  - `.pi/agent/docs/operator_workflow.md`
  - `logs/README.md`

## Recommended Next Implementation Step
1. decide whether to keep validation as runbook + script or add a narrower fast-check script for frequent iteration
2. review whether `safe-bash.ts` should prefer hard-block reasons before branch-policy reasons in some destructive command cases
3. move to the next bounded phase after evidence review
