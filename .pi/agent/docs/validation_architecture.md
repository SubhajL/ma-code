# Validation Architecture

This document defines the current validation architecture for the repo-local Pi harness.
It turns the current Phase A/B validation approach into one formal reference for operators, implementers, reviewers, and validators.

## Purpose
The validation system exists to answer four questions clearly:
- what is being validated
- where each validation responsibility lives
- how validation is executed
- how results are recorded for completion evidence

This architecture is intentionally layered.
Runtime safety is not delegated to one script, one prompt, or one report.
Instead, the harness uses multiple validation layers that reinforce each other.

## Scope
This document covers the currently implemented Phase A/B slice:
- repo and prompt wiring
- runtime safety controls
- task-discipline controls
- validator automation
- validation reporting

It does not claim that future phases are already implemented.
Instead, it defines how future validation work should attach to the current structure.

## Validation layers

### Layer 1 — Policy and operating rules
This is the rule-definition layer.
It defines what counts as safe work, valid mutation, and acceptable completion evidence.

Primary sources:
- `AGENTS.md`
- `SYSTEM.md`
- `.pi/agent/prompts/roles/*.md`
- `.pi/agent/prompts/templates/*.md`
- `.pi/agent/teams/*.yaml`

This layer establishes requirements such as:
- do not work directly on `main`
- do not mutate without an active task
- require acceptance criteria before mutation starts
- require evidence before completion
- prefer bounded, reversible changes
- escalate instead of improvising when scope expands or evidence is weak

Validation role of this layer:
- provides the normative contract
- gives reviewers and validators the rules they should enforce
- defines what downstream runtime and report layers must prove

### Layer 2 — Runtime enforcement controls
This is the live guardrail layer.
It enforces key policy constraints during execution rather than relying only on self-reporting.

Primary assets:
- `.pi/agent/extensions/safe-bash.ts`
- `.pi/agent/extensions/till-done.ts`
- `.pi/agent/state/schemas/*.json`
- `.pi/agent/state/runtime/tasks.json`
- `logs/harness-actions.jsonl`

Current responsibilities include:
- blocking protected writes such as `.env*`
- blocking destructive shell actions such as `git reset --hard`
- blocking normal tracked-file mutation on `main`
- requiring an active in-progress task before mutation
- requiring task owner and acceptance criteria before task start
- preventing task completion without evidence
- preserving compact audit entries for task and mutation events

Validation role of this layer:
- converts policy into enforceable runtime behavior
- creates concrete pass/fail conditions for validators
- reduces dependence on model compliance alone

### Layer 3 — Validator execution layer
This is the repeatable checking layer.
It runs bounded checks against the implemented runtime behavior.

Primary assets:
- `scripts/validate-phase-a-b.sh`
- `scripts/validate-skill-routing.sh`
- `.pi/agent/docs/runtime_validation_runbook.md`
- `.pi/agent/docs/operator_workflow.md`

Current structure:
- the script is the preferred automated path
- the runbook is the manual and debugging path
- the operator workflow explains when validation should be run and how evidence should be preserved

Validation role of this layer:
- verifies that policy and runtime controls are wired correctly
- provides repeatable regression coverage for the current harness slice
- gives a standard path for local validation before claiming completion

### Layer 4 — Validation outputs and evidence layer
This is the reporting layer.
It turns validator execution into reviewable evidence.

Primary output locations:
- `reports/validation/*.md`
- `reports/validation/*.json`
- `logs/coding/*.md`
- `reports/planning/*.md`
- `logs/CURRENT.md`

Validation role of this layer:
- records what was run
- records pass/fail outcomes
- preserves exact evidence for later review
- supports completion decisions without relying on memory or informal summaries

### Layer 5 — Human review and decision layer
This is the interpretation layer.
Validation artifacts are not the same as approval.
A reviewer, validator, or operator still decides whether the evidence is sufficient for the bounded task.

Primary inputs:
- validator reports
- coding logs
- planning logs
- changed files
- unresolved risk notes

Validation role of this layer:
- checks whether the evidence matches the claimed scope
- gives priority to validator/reviewer output over worker self-report
- blocks completion when evidence is missing, contradictory, or too weak

## Validator scripts and supporting assets

### Primary automated validator
Current primary foundation script:
- `scripts/validate-phase-a-b.sh`

This script is responsible for the current bounded Phase A/B regression path.
It should remain the default validator for changes that affect the implemented foundation.

Current checks include:
- basic Pi startup
- project prompt and skill discovery
- `task_update` tool availability
- TypeScript compile check for runtime extensions
- `safe-bash.ts` allow/block behavior checks
- explicit main-branch mutation protection checks
- `till-done.ts` task-discipline checks
- review-before-done task transition checks
- compact audit-log field checks
- cleanup and runtime state reset
- optional full-stack interaction when explicitly enabled

### Dedicated skill-routing validator
Current dedicated routing script:
- `scripts/validate-skill-routing.sh`

This script is responsible for the bounded regression path for:
- `.pi/agent/extensions/g-skill-auto-route.ts`
- skill keyword classification
- representative live skill-routing probes
- explicit `/skill:g-*` preservation under the routing extension

It should be used when changes affect the routing extension or its keyword/precedence behavior.

### Dedicated harness-routing validator
Current dedicated executable-routing script:
- `scripts/validate-harness-routing.sh`

This script is responsible for the bounded regression path for:
- `.pi/agent/extensions/harness-routing.ts`
- machine-readable routing policy in `.pi/agent/models.json`
- deterministic role/model route resolution
- optional bounded live tool probe for `resolve_harness_route`

It should be used when changes affect executable harness routing or its policy rules.

### Dedicated team-activation validator
Current dedicated team-activation script:
- `scripts/validate-team-activation.sh`

This script is responsible for the bounded regression path for:
- `.pi/agent/extensions/team-activation.ts`
- machine-readable activation policy in `.pi/agent/teams/activation-policy.json`
- team membership parsing from `.pi/agent/teams/*.yaml`
- deterministic planning/build/quality/recovery activation resolution
- optional bounded live tool probe for `resolve_team_activation`

It should be used when changes affect executable team activation or its policy rules.

### Manual validator path
Primary manual reference:
- `.pi/agent/docs/runtime_validation_runbook.md`

Use the runbook when:
- a scripted check fails
- one case needs isolation
- model behavior and tool behavior need to be separated
- debugging requires step-by-step observation

### Operator integration doc
Operational reference:
- `.pi/agent/docs/operator_workflow.md`

This document explains:
- when validation should run
- what validation is for
- where outputs belong
- what minimum completion evidence is expected

### Supporting evidence conventions
Additional references:
- `logs/README.md`
- `.pi/agent/docs/file_map.md`

These define where validation assets live and how they fit into the broader repo workflow.

## Report conventions

### Output locations
Validation reports belong under:
- `reports/validation/`

Related supporting evidence belongs under:
- `logs/coding/`
- `reports/planning/`

### Naming convention
Preferred validation filenames:
- `YYYY-MM-DD_<feature>-validation.md`
- `YYYY-MM-DD_<feature>-validation.json`

Script-generated reports may use a more specific suffix when needed, for example:
- `YYYY-MM-DD_<feature>-validation-script.md`
- `YYYY-MM-DD_<feature>-validation-script.json`

The naming should preserve:
- date
- bounded feature or task-group name
- validation/report type

### Markdown report convention
Markdown reports should be decision-friendly for a human reviewer.
They should usually include:
- title
- date or generated timestamp
- repo root or execution context when relevant
- summary table of checks
- one section per check
- command or execution path used
- key evidence or exact observed outcome
- final decision summary

Recommended qualities:
- use explicit `PASS`, `FAIL`, or `SKIP`
- include exact block reasons when a block is the expected result
- record cleanup status
- make it easy to compare the report against the implemented scope

### JSON summary convention
JSON summaries should be machine-readable and lightweight.
The current shape should remain simple and stable.

Current convention:
- top-level overall `status`
- top-level `failedChecks`
- top-level `checks` array

Each check entry should include:
- `name`
- `status`
- `detail`

If future phases need more metadata, they should extend this conservatively rather than replacing the shape without reason.

### Evidence linkage convention
A validation report is not sufficient in isolation.
It should connect back to the bounded workstream.

Expected linkage pattern:
- planning context in `reports/planning/...`
- implementation details and findings in `logs/coding/...`
- validator outputs in `reports/validation/...`
- current active pointer in `logs/CURRENT.md` when applicable

### Completion convention
A bounded task should not be treated as complete without visible evidence.
At minimum, completion evidence should still include:
- changed files
- relevant validation or test output when appropriate
- short explanation of what was done
- unresolved risks or known gaps

Validation reports are therefore one part of completion evidence, not a substitute for all of it.

## Current architecture boundary
The current architecture validates the implemented Phase A/B foundation plus bounded executable routing/activation slices that were attached later.
It does not yet provide dedicated validators for later capabilities such as:
- queue execution
- full team dispatch and orchestration runtime beyond deterministic activation resolution
- UI widgets or TUI-specific behaviors
- long-running autonomy or recovery loops beyond the current slice

Those areas should not be implied as covered unless they add explicit validation assets.

## Future phase attachments
Future validation work should attach to the current architecture in bounded, additive ways.

### Attachment rule 1 — preserve layering
New phases should map onto the same layer model:
- policy definition
- runtime enforcement or runtime behavior
- validator execution
- reporting and evidence
- human review and decision

A new feature is not fully attached if it only adds implementation without a validation path.

### Attachment rule 2 — prefer additive validator growth
When a future phase adds new runtime behavior, it should usually do one of the following:
- extend `scripts/validate-phase-a-b.sh` if the new coverage is a natural continuation of the same foundation
- add a new bounded validator script when the scope is meaningfully separate
- add matching runbook instructions for manual isolation and debugging

Do not silently overload one validator with unrelated domains if a dedicated validator would be clearer.

### Attachment rule 3 — keep report conventions stable
New validator outputs should continue to use:
- `reports/validation/` as the default output location
- markdown for human-readable reports
- JSON for machine-readable summaries
- explicit check names and pass/fail states

This keeps future validation comparable across phases.

### Attachment rule 4 — require cleanup and bounded side effects
Future validators should preserve the current discipline of:
- using disposable directories or bounded test state where possible
- restoring runtime state after checks
- avoiding destructive repo mutations
- making cleanup outcome visible in the report

### Attachment rule 5 — document coverage boundaries explicitly
Every new phase validator should state:
- what it covers
- what it does not cover
- what preconditions it assumes
- what artifacts it writes
- what cleanup it performs

This prevents false confidence and hidden scope widening.

### Attachment rule 6 — keep evidence reviewable
If a future phase introduces richer artifacts such as logs, screenshots, traces, or structured attachments, those should still roll up into the same decision pattern:
- validator output proves what happened
- coding log explains the bounded change
- unresolved risks remain visible

## Recommended future expansion points
When later phases are implemented, likely attachment points include:
- a dedicated validator for queue and task-runner behavior
- a validator for full multi-worker orchestration boundaries beyond the current activation resolver
- a validator for TUI or interface-level interactions if those become part of the repo-local harness contract
- optional fast-check validators for frequent iteration alongside the fuller regression script

These should be added only when the underlying feature exists and has a clear bounded acceptance target.

## Relationship to adjacent docs
Use this document as the architectural reference.
Use adjacent docs for execution details:
- `.pi/agent/docs/runtime_validation_runbook.md` for step-by-step validation execution
- `.pi/agent/docs/operator_workflow.md` for operator usage and completion flow
- `logs/README.md` for evidence and logging conventions
- `.pi/agent/docs/file_map.md` for file ownership and update locations

## Practical decision rule
Use this architecture to answer validation questions quickly:
- if the question is about rules, check the policy layer
- if the question is about enforcement, check runtime controls
- if the question is about how to test, check the validator layer
- if the question is about what counts as proof, check report conventions and evidence linkage
- if the question is about a future feature, attach it additively and document its boundary explicitly
