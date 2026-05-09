# Operator Workflow — Current Harness

This workflow explains how to operate the current Pi harness safely and consistently.

## Scope
This workflow covers the current implemented harness slice:
- Pi-native repo wiring
- repo policy and role contracts
- `safe-bash.ts`
- `till-done.ts`
- queue/recovery/runtime validation surfaces
- machine-readable completion-gate policy
- bounded runtime validation and operator-facing status/validator entrypoints

It does not assume:
- a free-running queue daemon beyond the bounded queue-step/session surfaces (`run_next_queue_job`, `run_queue_once`, and `run_bounded_queue_session` remain explicit operator-invoked controls)
- rich UI widgets or a dashboard daemon
- full team orchestration runtime

Architecture boundary note: `.pi/agent/docs/architecture_roadmap_alignment.md` is the canonical operator reference for distinguishing tactical Graphify adapter support, runtime validation enforcement, optional policy-gated mandatory Graphify use, bounded foreground session mode, and future roadmap gaps.

For fast operator snapshots or bounded queue advancement outside a live agent session, prefer the unified front door:
```bash
npm run harness:operator -- help
npm run harness:operator -- status
npm run harness:operator -- leases
npm run harness:operator -- queue-session -- --scope "bounded queue operation" --max-steps 3
npm run harness:operator -- worktree -- status
npm run harness:operator -- worker-session -- start --id HARNESS-064 --slug "worker lane"
npm run harness:operator -- parallel-worker-lanes dry-run --initiative <slug> --max-parallel 2
```

Legacy direct commands remain supported:
```bash
npm run harness:status
npm run harness:status:json
npm run harness:leases
npm run harness:leases:json
npm run harness:leases -- clear-stale
npm run harness:worker-session -- start --id HARNESS-064 --slug "worker lane"
npm run harness:worker-session -- status --scope harness-064
npm run harness:worker-session -- release --scope harness-064
npm run harness:queue-session -- --scope "bounded queue operation" --max-steps 3
npm run harness:queue-session:json -- --scope "bounded queue operation" --max-steps 3 --max-runtime-seconds 30
npm run harness:integrate -- --worktree ../ma-code-worktrees/harness-024-worktree-helpers
npm run harness:schedules
npm run harness:schedules:json
npm run harness:pr-gate -- --pr <number> --max-attempts 20
npm run harness:sync-main
npm run harness:slice-lifecycle -- status
npm run harness:slice-lifecycle -- check --stage create_ready
npm run harness:parallel-worker-lanes -- dry-run --initiative <slug> --max-parallel 2
```

Related operator docs:
- `.pi/agent/docs/operator_manual.md`
- `.pi/agent/docs/operator_quickstart.md`
- `.pi/agent/docs/operator_install_guide.md`
- `.pi/agent/docs/operator_troubleshooting_guide.md`

## Daily queue operator loop
When operating queued work in a live harness session, use the runtime tools in this order:

1. inspect current status with `inspect_queue_state`
   - confirm whether the queue is paused
   - confirm the active job and active task
   - review blocked or failed job/task IDs before taking action
   - review additive queue-session lease status before starting bounded queue work
2. inspect leases with `npm run harness:leases` when queue execution appears blocked by a lease
   - use `npm run harness:leases -- clear-stale` only for already-expired/stale leases
   - do not force-clear active leases as a normal operator action
3. pause intake with `pause_queue` when you want to stop new pickup without discarding state
4. resume intake with `resume_queue` when visible queue/task state is acceptable again
5. stop safely with `stop_queue_safely` when the current active job should move into a reviewable blocked state
6. advance at most one bounded step with `run_next_queue_job` or run one explicit bounded multi-step session with `run_bounded_queue_session`
7. inspect scheduled workflows when recurring bounded work should be queued
   - use `npm run harness:schedules` for a read-only due-work snapshot
   - use `node --import tsx scripts/harness-scheduled-workflows.ts materialize --workflow <id>` for dry-run inspection
   - add `--apply` only when you explicitly want to enqueue eligible scheduled jobs
8. review evidence, blockers, and validation before declaring work complete

Recommended operator questions during this loop:
- is the queue paused intentionally?
- is there an active running job?
- does the linked active task match the queue state?
- are there blocked or failed items that need a human decision?
- should the next action be resume, stop, one bounded queue step, or one bounded queue session?


### Slice lifecycle assessment

Use the slice lifecycle helper as an assess-first preflight before create, submit, and merge-ready claims:

```bash
npm run harness:slice-lifecycle -- status
npm run harness:slice-lifecycle -- check --stage create_ready
npm run harness:slice-lifecycle -- check --stage merge_ready --json
```

The helper reads existing logs/task/git/PR-gate/sync-main evidence and reports the current checkpoint, missing prerequisites, blocking gaps, and next allowed actions. It does not create a second mutable workflow state machine. See `.pi/agent/docs/slice_lifecycle.md`.

## Core operating loop

### 1. Start from the repo root
```bash
cd /Users/subhajlimanond/dev/ma-code
```

### 2. Work on a bounded branch or worktree
Follow `AGENTS.md`:
- never work directly on `main`
- prefer small bounded changes
- keep scope explicit

When a dedicated worktree helps keep ownership and cleanup obvious, prefer the unified wrapper front door:
```bash
npm run harness:operator -- worktree -- branch-name --id HARNESS-024 --slug "worktree helpers"
npm run harness:operator -- worktree -- create --id HARNESS-024 --slug "worktree helpers"
npm run harness:operator -- worktree -- status
```

Legacy direct worktree commands remain supported:
```bash
npm run harness:worktree -- branch-name --id HARNESS-024 --slug "worktree helpers"
npm run harness:worktree -- create --id HARNESS-024 --slug "worktree helpers"
npm run harness:worktree -- status
```

Before presenting a worktree as merge-ready, use:
```bash
npm run harness:worktree -- review-prep --path ../ma-code-worktrees/harness-024-worktree-helpers
```

After merge or explicit abandonment, remove only a clean linked worktree:
```bash
npm run harness:worktree -- cleanup --path ../ma-code-worktrees/harness-024-worktree-helpers
```

To move a validated linked worktree branch into local main, use the bounded integration helper instead of raw `git merge` on `main`:
```bash
npm run harness:integrate -- --worktree ../ma-code-worktrees/harness-024-worktree-helpers
npm run harness:integrate:json -- --worktree ../ma-code-worktrees/harness-024-worktree-helpers --skip-validation
```
- requires review-prep/merge-ready source worktree evidence
- uses fast-forward-only merge semantics into local `main`
- blocks on tracked dirt and unexpected untracked files in the root worktree
- tolerates only narrow generated validation artifacts
- writes post-merge validator report outputs to temp paths by default

For an explicit worker lane, compose the worker-lane lease and worktree lifecycle through `harness:worker-session`:
```bash
npm run harness:worker-session -- start --id HARNESS-064 --slug "worker lane"
npm run harness:worker-session -- status --scope harness-064
npm run harness:worker-session -- release --scope harness-064
npm run harness:worker-session -- release --scope harness-064 --cleanup
```
- worker sessions differ from queue sessions: they reserve a worker lane and worktree but do not dispatch or execute queued jobs
- release preserves the worktree by default
- cleanup is explicit and refuses dirty worktrees

For cross-slice product implementation lanes, use Phase 12 parallel worker lanes only when Phase 10 proof allows different whole slices to run together:
```bash
npm run harness:parallel-worker-lanes -- dry-run --initiative <slug> --max-parallel 2
npm run harness:parallel-worker-lanes -- apply --initiative <slug> --max-parallel 2
npm run harness:parallel-worker-lanes -- run --initiative <slug> --max-parallel 2 --max-runtime-seconds 300 --worker-command '<explicit command>'
npm run harness:parallel-worker-lanes -- status --initiative <slug>
npm run harness:parallel-worker-lanes -- cleanup --initiative <slug> --lane-id <lane-id>
```
- no daemon is created; `run` is foreground and bounded
- same-slice phases remain sequential; parallelism is only across different whole slices
- cross-slice parallelism requires Phase 10 `parallelAllowed: true` proof for every active pair
- lane manifests are written under initiative docs, while leases are managed by helpers rather than raw runtime JSON edits
- failed worktrees are preserved for inspection; successful cleanup is explicit and refuses dirty worktrees

For PR CI/security gate checks, use the bounded helper instead of `gh pr checks --watch`:
```bash
npm run harness:pr-gate -- --pr <number> --max-attempts 20
npm run harness:pr-gate:json -- --pr <number> --once
```
- the default interval is 180 seconds, so checks are polled once every 3 minutes
- the helper calls `gh pr checks` without `--watch`
- it reports CI/security checks plus review/comment triage and classifies Dependency Review success bot comments as benign
- if the helper reports `fix_required`, inspect the failed check or non-benign comment, make one bounded fix, then rerun the helper

For local main sync after a PR merge, use the fast-forward-only helper:
```bash
npm run harness:sync-main
npm run harness:sync-main:json
```
- it fetches `origin/main` and only runs `git merge --ff-only origin/main`
- it preserves ignored runtime bookkeeping under `.pi/agent/state/runtime/` and `logs/harness-actions.jsonl`
- it blocks when non-bookkeeping tracked dirt exists instead of hiding source changes

### 3. Make or review one bounded change set
Examples:
- config wiring
- schema adjustment
- one runtime extension change
- one validator change
- one scheduled workflow inspection/materialization pass

### 4. Run validator before claiming completion
Preferred command:
```bash
./scripts/validate-phase-a-b.sh
```

For `till-done.ts` / completion-gate changes, the validator now covers:
- validation-before-done enforcement
- lighter docs/research validation path
- validator `fail` / `blocked` rejection flow
- explicit manual override path

Useful variants:
```bash
./scripts/validate-phase-a-b.sh --skip-compile
./scripts/validate-phase-a-b.sh --include-fullstack
```

### 5. Save evidence
Record evidence in:
- coding log: `logs/coding/...`
- planning log: `reports/planning/...`
- validation reports: `reports/validation/...`
- runtime audit log when relevant: `logs/harness-actions.jsonl` (local-only runtime bookkeeping)

## Cross-phase working patterns
These patterns should now guide planning, implementation, and review even before later phases are fully implemented.

### Graphify evidence lifecycle drift guard
- Graphify evidence lifecycle drift guard: explicit research queue-session orchestration -> graphifyEvidence in packet/handoff -> task_update validator consumption.
- This lifecycle is bounded: metadata is optional, there is no global mandatory Graphify, no Graphify CLI --watch, daemon, or background behavior, and source verification remains required.

### Codebase discovery
- Canonical discovery policy: `.pi/agent/docs/discovery_policy.md`
- executable helper: `select_discovery_policy` from `.pi/agent/extensions/discovery-policy.ts`
- use that policy/helper when choosing among Auggie, Graphify, local read/rg/find, and Exa
- use Auggie MCP first when it is available and non-blocking
- Graphify is an optional discovery fallback, not a required harness dependency.
- Graphify is not a live web-search replacement for Exa.
- Graphify should be run by research/system-analysis lanes and consumed by planning lanes.
- use Graphify only when it is installed, scoped, safe, and useful for broad codebase or curated local research-corpus discovery
- bounded queue-session can invoke `run_graphify_orchestration` for explicitly opted-in research queue jobs only when the queued job sets `graphifyOrchestration.enabled: true`; it runs at most once per bounded session, records visible session/job evidence, and does not make Graphify automatic for all research jobs
- use Exa for current external web information rather than local repo facts
- if Auggie is unavailable, errors, or cannot be bounded safely, fall back immediately to appropriate local tools or scoped Graphify report inspection
- local fallback means targeted `read`, `grep`/`rg`, `find`, and direct file inspection
- Graphify-backed acceptance cannot pass unless the latest relevant graph was queried or freshness/cadence was checked, and important claims were verified with direct source inspection.
- record which discovery path was used when it matters to planning or validation evidence

### Product planning discipline
- Product planning flows from grill-style clarification to PRD to vertical-slice backlog.
- Vertical slices must be independently demonstrable or verifiable.
- use grill-style clarification when product goals, users, constraints, or success criteria are unclear
- synthesize PRDs with problem statement, solution, user stories, implementation decisions, testing decisions, out-of-scope items, and further notes
- split PRDs into thin tracer-bullet slices that cut through required layers end-to-end instead of horizontal layer-only batches
- mark slices HITL when human product, architecture, design, auth, secrets, or deployment judgment is required; mark AFK only when scope and validation are clear

### Live Stitch artifact operation
- Mock mode remains default for Stitch screen artifacts; use `harness:stitch-artifact` unless an operator explicitly approves live generation.
- Use `npm run harness:live-stitch-artifact -- --initiative <slug> --slice <slice-id> --dry-run` first to validate prompt metadata, source hashes, managed paths, required auth/config, and planned live call shape without writing files.
- Use `npm run harness:live-stitch-artifact -- --initiative <slug> --slice <slice-id> --apply --approval-ref operator-approved-live-stitch:<ref>` only with environment/runtime auth and one bounded provider call.
- Do not print token values; live credentials must come from environment/runtime configuration only.
- Managed live payloads stay under `.pi/agent/artifacts/stitch/`; durable initiative docs store summaries, hashes, and references only.
- Generated live output still requires human approval and does not create task packets, queue jobs, worker sessions, or frontend/backend code.

### Planning discipline
For medium- or high-risk work, planning should make these explicit:
- goal and non-goals
- files to inspect or modify
- validation ideas and expected proof
- important edge cases
- wiring or registration checks for new runtime components
- migration-path note when the change is architectural or crosses subsystem boundaries
- whether second-model planning synthesis was used or fell back to single-model planning

### Implementation discipline
When relevant, implementation evidence should include:
- smallest relevant validation or test commands
- failing/pass evidence when practical
- changed files
- wiring verification for new runtime components
- known gaps instead of hidden assumptions

For TDD work:
- use behavior-first TDD: one failing behavior test, one minimal implementation, then repeat
- do not batch speculative tests ahead of implementation
- prefer tests through public interfaces and observable behavior
- mock only system boundaries by default
- refactor only while GREEN, then rerun the relevant tests after each refactor step

### Review discipline
Review and validation outputs should prefer:
- severity-ordered findings
- exact file references when possible
- concrete fix direction
- named tests or validation still needed

## What the validator script is for
The validator script is not part of the runtime agent loop.
It serves the operator and validator workflow by providing:
- repeatable regression checks
- pass/fail proof for core runtime controls
- cleanup after validation
- machine-readable validation summary

## Validation cost guardrails
Not all validation has the same cost.
For this repo, use this default order:
- cheap/local checks first
  - readback
  - `rg`/`find`
  - compile/typecheck/lint
  - deterministic helper-level tests
- then one live provider-backed validator run only when local evidence is not enough
  - for HARNESS-051 prompt semantics, `bash scripts/validate-prompt-semantics-live.sh` enforces the required local-first gate and performs one bounded live proof without automatic retries

Repeated live `pi ...` validator reruns are not the default.
Use them only when:
- a human explicitly approves the extra spend, or
- there is a clearly stated flake investigation need and cheaper checks cannot answer it

When a repeated live rerun is used, record:
- why one run was insufficient
- why local evidence was insufficient
- what scope was rerun

## Validation assets
### Helper CLIs
- `scripts/harness-operator-status.ts`
- `scripts/harness-queue-session.ts`
- `scripts/harness-scheduled-workflows.ts`
- `scripts/harness-worktree.ts`

### Primary validators
- `scripts/validate-phase-a-b.sh`
- `scripts/validate-queue-semantics.sh`
- `scripts/validate-extension-unit-tests.sh`
- `scripts/validate-recovery-policy.sh`
- `scripts/validate-recovery-runtime.sh`
- `scripts/validate-queue-runner.sh`
- `scripts/validate-core-workflows.sh`
- `scripts/validate-prompt-semantics.sh`
- `scripts/validate-prompt-semantics-live.sh`
- `scripts/validate-harness-package.sh`
- `scripts/validate-skill-routing.sh`
- `scripts/validate-harness-routing.sh`
- `scripts/validate-team-activation.sh`
- `scripts/validate-task-packets.sh`
- `scripts/validate-handoffs.sh`
- `scripts/validate-same-runtime-bridge.sh`
- `scripts/collect-harness-tuning-data.sh`

### Supporting docs
- `.pi/agent/docs/runtime_validation_runbook.md`
- `.pi/agent/docs/operator_manual.md`
- this file: `.pi/agent/docs/operator_workflow.md`
- `.pi/agent/docs/operator_quickstart.md`
- `.pi/agent/docs/operator_install_guide.md`

### Outputs
- markdown report: `reports/validation/*.md`
- JSON summary: `reports/validation/*.json`

Scan validator reports in this order:
1. `Summary Table`
2. `Final Decision`
3. `Detailed Results`

Use that scan order to answer three operator questions quickly:
- did anything fail?
- what is the bounded verdict / next step?
- which exact command or evidence needs drill-down?

## When to run validation
Run the validator script when:
- changing `.pi/settings.json`
- changing `.pi/SYSTEM.md`
- changing `AGENTS.md`
- changing task schema or runtime task state shape
- changing queue schema or runtime queue state shape
- changing `safe-bash.ts`
- changing `till-done.ts`
- changing `.pi/agent/validation/completion-gate-policy.json`
- changing `.pi/agent/extensions/g-skill-auto-route.ts`
- changing `.pi/agent/extensions/discovery-policy.ts` or `.pi/agent/docs/discovery_policy.md`
- changing `.pi/agent/extensions/recovery-policy.ts`
- changing `.pi/agent/extensions/recovery-runtime.ts`
- changing `.pi/agent/extensions/queue-runner.ts`
- changing `tests/integration/core-workflows.test.ts`
- changing `scripts/validate-core-workflows.sh`
- changing `.pi/agent/recovery/recovery-policy.json`
- changing queue jobs that rely on executable runner linkage fields such as `acceptanceCriteria`, `linkedTaskId`, or packet metadata
- changing `.pi/agent/extensions/harness-routing.ts`
- changing `.pi/agent/models.json` routing policy
- changing `.pi/agent/extensions/team-activation.ts`
- changing `.pi/agent/teams/activation-policy.json`
- changing team membership definitions under `.pi/agent/teams/*.yaml`
- changing `.pi/agent/extensions/task-packets.ts`
- changing `.pi/agent/packets/packet-policy.json`
- changing `.pi/agent/state/schemas/task-packet.schema.json`
- changing `.pi/agent/extensions/handoffs.ts`
- changing `.pi/agent/handoffs/handoff-policy.json`
- changing `.pi/agent/state/schemas/handoff.schema.json`
- changing `.pi/agent/extensions/same-runtime-bridge.ts`
- changing audit logging behavior or expectations
- changing `.pi/agent/package/harness-package.json`, package templates, or `scripts/harness-package.ts`
- before calling a bounded phase complete

Choose the validator that matches the change:
- prefer `npm run harness:operator -- <subcommand>` as the unified operator front door for status, leases, queue-session, worktree, and worker-session actions; legacy direct commands remain valid
- use `npm run harness:status` or `npm run harness:status:json` for a read-only operator snapshot before deciding whether to resume, stop, or advance queue work
- use `npm run harness:queue-session -- --scope "<bounded scope>" --max-steps <n>` when you want bounded multi-step queue advancement without a hidden daemon; it stops at the next waiting point, blocked state, pause, idle state, or configured limit and returns a richer triage summary with action counts, touched job IDs, and a recommended next action
- use `npm run harness:schedules` or `npm run harness:schedules:json` to inspect due scheduled workflows, then use `node --import tsx scripts/harness-scheduled-workflows.ts materialize --workflow <id> --apply` only for explicit queue creation
- use `npm run harness:worktree -- status` to inspect linked worktrees and `npm run harness:worktree -- review-prep --path <worktree>` before claiming a worktree is ready for review or cleanup
- use `npm run harness:integrate -- --worktree <worktree>` when the next safe action is a local fast-forward integration from a merge-ready linked worktree into root `main`
- use `npm run harness:worker-session -- start/status/release` when the worktree should be owned by an explicit worker-lane lease; this remains an advanced lifecycle tool, not automatic multi-worker orchestration
- use `./scripts/validate-extension-unit-tests.sh` plus `./scripts/check-foundation-extension-compile.sh` for discovery-policy helper changes
- use `./scripts/validate-phase-a-b.sh` for foundation/runtime-safety changes
- use `./scripts/validate-queue-semantics.sh` for queue schema/semantics changes
- use `./scripts/validate-extension-unit-tests.sh` for extension unit-test coverage across safety/task-discipline/orchestration helper surfaces
- use `./scripts/validate-recovery-policy.sh` for failure taxonomy / provider-failure / retry-eligibility recovery policy changes
- use `./scripts/validate-recovery-runtime.sh` for explicit retry / rollback / stop runtime decision changes
- use `./scripts/validate-queue-runner.sh` for bounded queue start/finalize behavior, stop-condition enforcement (retries/runtime/failed validations/approval boundaries), unsupported-control blocking, and queue-runner wiring changes; it attempts one bounded live probe by default when possible, and `--skip-live` is available for CI/static runs
- use `./scripts/validate-core-workflows.sh` for isolated end-to-end task/queue workflow coverage across docs-only completion, implementation pass, validation fail visibility, recovery finalization, and provider/tool-block handling
- use `./scripts/validate-graphify-discovery.sh` for the canonical Graphify validation path across focused compile proof, Graphify unit tests, discovery-policy selector tests for Graphify fallback choices, Graphify integration proof, and Graphify prompt-contract skepticism checks; add `--smoke` only when one explicit installed-CLI proof is needed
- use `./scripts/validate-prompt-semantics.sh` for local semantic fixture changes to critical prompt surfaces or the semantic fixture inventory
- use `bash ./scripts/validate-prompt-semantics-live.sh` when one bounded provider-backed semantic proof is needed after the local semantic validator is already green
- use `./scripts/validate-skill-routing.sh` for skill-routing changes
- use `./scripts/validate-harness-routing.sh` for executable harness-routing changes
- use `./scripts/collect-harness-tuning-data.sh` after harness-routing/core-workflow/queue-runner/scheduled-workflow changes when you want a bounded thinking-first cost/performance tuning report from local validator timings, scheduled-workflow dry runs, and role-level cost-ish routing summaries
- use `./scripts/validate-harness-package.sh` for reusable-vs-repo-local package manifest, bootstrap helper, install-template, and fresh-target adoption changes
- use `./scripts/validate-team-activation.sh` for executable team-activation changes
- use `./scripts/validate-task-packets.sh` for executable task-packet changes, especially when goal/non-goal clarity, inspect-vs-modify file plans, expected proof, migration-path notes, or escalation instructions were tightened
- use `./scripts/validate-handoffs.sh` for executable handoff changes, especially when discovery summaries, scope boundaries, evidence expectations, wiring checks, review risks, validation questions, expected proof, or recovery migration-path notes were tightened
- use `./scripts/validate-same-runtime-bridge.sh` for same-runtime probe bridge changes

## Minimum completion evidence for this harness slice
A bounded change is not complete unless you can show:
- changed files
- validator or test evidence
- short explanation of what changed
- unresolved risks or caveats

For tasks completed through `task_update`, the current completion gate also expects:
- task status reaches `review` before `done`
- validation result is recorded as `pass` or explicit `overridden`
- docs/research tasks use the lighter allowed validation path rather than skipping proof
- manual overrides retain approval metadata in task state/evidence

## Recommended decision rule
### Use the script when:
- you want repeatable confidence
- you touched runtime logic
- you want a pass/fail artifact
- one live run is enough for the current proof target

### Use the runbook manually when:
- one validator check failed
- you want to isolate a single case
- you are debugging model behavior vs tool behavior

## Practical workflow example
### Example: editing `safe-bash.ts`
1. update the file
2. run:
   ```bash
   ./scripts/validate-phase-a-b.sh
   ```
3. inspect:
   - `reports/validation/...-script.md`
   - `reports/validation/...-script.json`
   - scan the markdown report in this order:
     1. `Summary Table`
     2. `Final Decision`
     3. `Detailed Results`
4. summarize evidence in current coding log
5. note any gaps instead of hiding them

## Current boundaries
This workflow currently validates only the implemented Phase A/B slice.
It does not validate future items like:
- a free-running queue daemon or scheduled autonomy loop beyond the explicit `run_next_queue_job` / `run_bounded_queue_session` surfaces
- team dispatch beyond the current deterministic routing/packet/handoff surfaces
- UI widgets
- long-running autonomy beyond bounded operator-invoked queue steps/sessions

When those exist, they should add new validation scripts or extend the current validator in bounded ways.

- For Graphify adapter or Graphify fallback-selection changes, use `bash scripts/validate-graphify-discovery.sh`; add `--smoke` only when one explicit installed-CLI proof is needed, and confirm generated artifacts stay under ignored `.pi/agent/artifacts/graphify/<task-id>/`.

## Merge helper / release policy

Phase 8 adds `harness:merge`, a bounded merge-readiness and apply helper. It composes the slice lifecycle helper, PR gate evidence, PR review/comment state, local repo cleanliness, and optional explicit sync-main.

Useful commands:
```bash
npm run harness:merge -- check --pr <number>
npm run harness:merge -- check --pr <number> --lifecycle-evidence reports/lifecycle/<task-id>.merge-evidence.json
npm run harness:merge -- apply --pr <number> --method squash
npm run harness:merge -- apply --pr <number> --method squash --sync-main
npm run validate:merge-helper
```

`harness:merge` is not deployment automation. It does not tag releases, publish changelogs, resolve merge conflicts, or sync local main unless `--sync-main` is explicitly supplied. For isolated worktree runs where protected runtime task state is unavailable, pass a reviewed lifecycle evidence bundle with `--lifecycle-evidence`; missing RED/GREEN, g-check, PR URL, or PR-gate pass evidence still blocks merge readiness.

### Product pipeline runtime

Phase 11 provides the bounded product pipeline surface for chaining initiative artifacts into a visible slice execution plan:

```bash
npm run harness:product-pipeline -- dry-run --initiative <feature-slug> --json
npm run harness:product-pipeline -- apply --initiative <feature-slug> --max-parallel 1
npm run harness:product-pipeline -- status --initiative <feature-slug>
npm run harness:operator -- product-pipeline dry-run --initiative <feature-slug>
```

Use dry-run first: it writes no files, shows the complete slice DAG, reports HITL gates, and reports Phase 10 parallel decisions. Use apply only for one bounded foreground materialization step. Apply stops at HITL gates, writes only `docs/initiatives/<slug>/pipeline-runs/<run-id>.json`, and does not create runtime tasks, queue jobs, worker sessions, handoffs, or product code.

Parallelism remains conservative: intra-slice phases remain sequential, and cross-slice parallelism requires Phase 10 `parallelAllowed: true` proof for every active pair. Missing proof blocks parallel materialization.

## Phase 14 product pipeline E2E pilot

Phase 14 is validated by `.pi/agent/docs/product_pipeline_e2e_pilot.md` and `./scripts/validate-product-pipeline-e2e.sh`. The pilot uses the `checkout-mini` fixture in temp repos, writes Markdown/JSON reports under `reports/validation/`, proves success and blocked paths, keeps HITL `waiting_for_human` gates visible, and introduces no daemon/watch mode, no live provider/Stitch call by default, no protected runtime JSON mutation, and no product implementation code outside temp fixtures.

## Phase 2 master orchestrator dry-run planner

Use the classifier or delegated dry-run planner when the next safe harness path is unclear:

```bash
npm run harness:orchestrate -- classify --goal "Build checkout mini flow" --json
npm run harness:operator -- orchestrate classify --goal "Build checkout mini flow" --json
npm run harness:orchestrate -- dry-run --goal "Build checkout flow for shoppers to place orders and complete payments so the team can validate order confirmation acceptance" --json
npm run harness:operator -- orchestrate dry-run --goal "Build checkout flow for shoppers to place orders and complete payments so the team can validate order confirmation acceptance" --json
```

Rules:
- `classify` writes no files and emits JSON/stdout only.
- `dry-run` invokes exactly one allowlisted helper only when the classification is concrete and placeholder-free.
- The normalized plan returns `writesFiles: false`, `selectedPath`, `delegatedCommand`, `status`, `blockers`, `missingArtifacts`, `hitlGates`, and `nextSafeActions`.
- Phase 2 does not apply artifacts, mutate queue/task runtime state, create PRs, or merge.
- Ambiguous requests return `status: "needs_input"` and no delegated command.

See `.pi/agent/docs/master_orchestrator.md` for the selected-path contract.
