# Repo-Local Pi Harness — GPT-5.4 First

This pack is reorganized so that the Pi-specific harness assets live **inside each repo that uses them**.

## Root-level files
Keep these at repo root so Pi can discover them as project instructions and durable governance artifacts:
- `AGENTS.md`
- `SYSTEM.md`
- `docs/`

## Repo-local Pi harness files
Everything else lives under:
- `.pi/agent/...`

This includes:
- prompts
- templates
- routing docs
- models/settings
- team definitions
- state schemas
- runtime state templates/placeholders (live runtime state is local-only and ignored)
- extension specs
- skills
- harness docs
- intake trigger policy metadata

## Greenfield scaffold docs
- Initiative overview: `docs/initiatives/greenfield-scaffold/README.md`
- Readiness gate: `docs/initiatives/greenfield-scaffold/readiness-checklist.md`
- Backout guide: `docs/initiatives/greenfield-scaffold/backout.md`
- Validation bundle: `docs/initiatives/greenfield-scaffold/validation.md`

## Current status
This is a **repo-local harness foundation with first live runtime controls**, not a finished full harness.

Implemented here:
- GPT-5.4-first policy split
- repo-local Pi folder structure
- revised role files
- revised templates
- normalized routing config with verified runnable IDs
- team files
- task and queue schemas
- generated local-only runtime state files
- live runtime extensions:
  - `.pi/agent/extensions/safe-bash.ts` — regex guardrail layer, not a sandbox; catches common-shape destructive commands but bypassable via `bash -c`, `eval`, command substitution, etc. See `.pi/agent/extensions/safe-bash.spec.md` for scope and limits.
  - `.pi/agent/extensions/till-done.ts` — task discipline and completion gates (hard enforcement)
- live task tool:
  - `task_update`
- validation runbook and validation script
- executable team-activation resolver and activation policy
- executable task-packet generator, packet policy, and packet schema
- executable handoff generator, handoff policy, and handoff schema
- optional `graphifyEvidence` metadata on generated task packets and handoffs for Graphify-backed or architecture-review proof context
- validator checks in `task_update` can consume structured `graphifyEvidence` orchestration evidence as graph query/freshness and source-verification proof
- executable recovery policy and runtime decision surfaces for bounded retry/rollback/stop recommendations before queue automation
- bounded queue execution via `run_next_queue_job` plus explicit multi-step sessions via `run_bounded_queue_session` in `.pi/agent/extensions/queue-runner.ts` (`run_queue_once` remains as a compatibility alias)
- file-backed scheduled workflow definitions plus explicit due-work inspection/materialization via `scripts/harness-scheduled-workflows.ts`
- file-backed package/bootstrap scaffolding via `.pi/agent/package/harness-package.json` and `scripts/harness-package.ts`
- same-runtime probe bridge for shared model/account-path child sessions
- executable discovery-policy selector helper via `.pi/agent/extensions/discovery-policy.ts` / `select_discovery_policy`
- task-class-aware validation checklist logic and proof-based completion gates in `till-done.ts`
- validation reports and file map

Not yet implemented:
- a free-running queue daemon or hidden scheduled workflow loop
- broader team orchestration runtime beyond deterministic activation, packets, handoffs, recovery, and one-step queue advancement
- rich UI widgets / dashboard components beyond the lightweight CLI status surface
- broader automated test suite beyond bounded runtime validation

## Typecheck

`npm run typecheck` runs `tsc --noEmit` against the root `tsconfig.json`, which covers `scripts/`, `.pi/agent/extensions/`, `tests/extension-units/`, and `tests/integration/`. This complements the existing `check-foundation-extension-compile.sh` CI job, which only typechecks a hand-picked subset of 41 extension files and silently leaves `scripts/`, all tests, and several extensions (notably `worker-execution.ts`, `worker-same-runtime-execution.ts`, `pr-lifecycle.ts`, `slice-lifecycle.ts`) unchecked.

The root typecheck is wired into CI via the `typecheck-baseline` job in `.github/workflows/ci.yml`. It runs `scripts/check-typecheck-baseline.sh`, which compares the current error count against the value pinned in `.typecheck-baseline-count` and:

- **fails** if the count goes **up** (regression);
- **passes with a warning** if the count goes **down** (burndown reminder to ratchet the file lower in a follow-up);
- **passes silently** when counts match.

This lets the existing baseline (45 errors across 14 files, catalogued in [`docs/initiatives/harness-cleanup/coverage-audit.md`](./docs/initiatives/harness-cleanup/coverage-audit.md)) be burned down incrementally without blocking unrelated PRs, while preventing new errors from sneaking in. Once the baseline reaches 0, `check-foundation-extension-compile.sh` can be retired in favor of the root config.

## Roadmap status
Current implementation is best understood as the **first validated Phase A/B foundation slice**.
That means the repo currently has:
- repo-local harness structure
- role/prompt foundation
- task and queue schemas as state artifacts
- local-only generated runtime bookkeeping in the canonical SQLite store at `.pi/agent/state/runtime/pi.db` (tasks, queue jobs, leases, audit rows); the sibling `tasks.json`/`queue.json`/`leases.json` files are compatibility/export artifacts only, and `logs/harness-actions.jsonl` is the append-only audit history (the queryable audit source is the SQLite `audit_log` table)
- first live runtime controls
- bounded validation workflow

It does **not** yet mean later roadmap phases are complete.
In particular:
- **Phase F** means structured team orchestration
- **Phase I** means bounded long-running autonomy
- **Phase J** is where bounded autonomy becomes much more practical to operate day to day

So Phase F should be read as:
- real multi-agent orchestration
- not yet “almost hands-free programming” by itself

Related docs:
- architecture decision records (load-bearing decisions, authoritative when in conflict with prose docs): [`docs/adr/README.md`](./docs/adr/README.md)
- discovery policy: `.pi/agent/docs/discovery_policy.md`
- Graphify adapter and runtime command: `.pi/agent/docs/graphify_adapter.md` (`.pi/agent/extensions/graphify-orchestrator.ts` / `run_graphify_orchestration` delegates to `graphify_adapter`)
- validation architecture: `.pi/agent/docs/validation_architecture.md`
- architecture/roadmap alignment boundary map: `.pi/agent/docs/architecture_roadmap_alignment.md`
- bounded autonomy architecture: `.pi/agent/docs/bounded_autonomy_architecture.md`
- phase capability map: `.pi/agent/docs/harness_phase_capability_map.md`
- architecture review workflow: `.pi/agent/docs/architecture_review_workflow.md`
- Graphify optional discovery/research policy: `.pi/agent/docs/graphify_discovery_research.md`
- Graphify final runbook/checklist: `.pi/agent/docs/graphify_final_runbook.md`
- product planning workflow: `.pi/agent/docs/product_planning_workflow.md`
- behavior-first TDD workflow: `.pi/agent/docs/tdd_behavior_first_workflow.md`
- deep-module refactoring workflow: `.pi/agent/docs/deep_module_refactoring_workflow.md`
- architecture/drift review artifacts:
  - `.pi/agent/prompts/templates/request-architecture-review.md`
  - `.pi/agent/prompts/templates/assess-drift-capability.md`
  - `.pi/agent/prompts/templates/propose-migration-path.md`



## Phase model routing

Phase 7 adds optional `phaseLane` support to `resolve_harness_route` for product pipeline phases. Existing role-only calls remain backward compatible.

Supported lanes:
- `screen_design`
- `frontend_implementation`
- `backend_implementation`

Requested future targets such as `opus-4.7` and `gpt-5.5` are represented in `.pi/agent/models.json` as unverified requests and use verified fallbacks until exact provider/model IDs are verified. See `.pi/agent/docs/phase_model_routing.md`.

Useful commands:
```bash
npm run validate:harness-routing -- --report /tmp/phase7-routing.md --summary-json /tmp/phase7-routing.json
```

Phase 7 routing does not create task packets, queue jobs, worker sessions, handoffs, or dispatch behavior.

## Slice contracts

Phase 6 adds `harness:slice-contract`, a deterministic helper that reads the approved mock screen artifact plus hash-bound approval sidecar and writes shared FE/BE contract artifacts only under `docs/initiatives/<slug>/contracts/`.

Useful commands:
```bash
npm run harness:slice-contract -- --initiative checkout-ui --slice slice-001 --dry-run
npm run harness:slice-contract -- --initiative checkout-ui --slice slice-001 --apply
npm run validate:slice-contract
```

The helper does not create task packets, handoffs, queue jobs, worker sessions, or runtime state. It gates FE implementation on a current approved screen artifact and a current slice contract.

## Frontend packet generation

Phase 8 adds `harness:fe-packet`, a preview-only frontend packet generator that turns approved UI-facing slice artifacts into a valid `frontend_worker` implementation task packet.

Useful commands:
```bash
npm run harness:fe-packet -- --initiative checkout-ui --slice slice-001 --dry-run
npm run harness:fe-packet -- --initiative checkout-ui --slice slice-001 --apply
npm run validate:frontend-packet
```

The helper validates the approved screen artifact, hash-bound approval sidecar, current contract, and UI-facing slice plan. It writes only `docs/initiatives/<slug>/packets/<slice-id>.frontend.packet.{json,md}` in apply mode. It creates no runtime tasks, no queue jobs, no worker sessions, and no backend packets; backend packet generation waits for a later phase. Generated packets use the Phase 7 `frontend_implementation` routing lane with verified fallback behavior until requested models are verified.

## Backend packet generation

Phase 9 adds `harness:be-packet`, a preview-only backend packet generator that follows frontend validation and turns a Phase 8 FE packet, passed FE validation evidence, and current slice contract into a valid `backend_worker` implementation task packet.

Useful commands:
```bash
npm run harness:be-packet -- --initiative checkout-ui --slice slice-001 --dry-run
npm run harness:be-packet -- --initiative checkout-ui --slice slice-001 --apply
npm run validate:backend-packet
```

The helper validates passed FE validation evidence, current contract hash, backend API/data expectations, backend allowed paths, backend TDD seeds, and backend-applicable slice planning. It writes only `docs/initiatives/<slug>/packets/<slice-id>.backend.packet.{json,md}` in apply mode. It creates no runtime tasks, no queue jobs, no worker sessions, no FE packet changes, and no product code. Generated packets use the Phase 7 `backend_implementation` routing lane with verified fallback behavior until requested models are verified.

Phase 10 adds `harness:slice-dependencies`, a pure/read-only slice dependency decision helper for future cross-slice parallelism proof.

```bash
npm run harness:slice-dependencies -- --check <slice-summary.json> <slice-summary.json> --json
npm run validate:slice-dependencies
```

The helper returns structured blockers and proof flags for same-slice requests, missing files/allowed-path proof, shared files, contracts, schema/migration/config/test/fixture paths, and lease/worktree conflict readiness. It does not change queue-runner behavior, does not create runtime tasks, does not create queue jobs, does not acquire leases, does not start worker sessions, and does not schedule cross-slice parallel work. Intra-slice phases remain sequential. See `.pi/agent/docs/slice_dependency_decision.md`.

## Domain governance

Phase 7 adds advisory-first domain governance for task packets and feature bootstrap docs. Use it to keep frontend/backend/infra ownership explicit without splitting shared intake too early.

Key assets:
- `.pi/agent/governance/domain-governance-policy.json`
- `.pi/agent/extensions/domain-governance.ts`
- `.pi/agent/docs/domain_governance.md`
- `scripts/validate-domain-governance.sh`

Useful commands:
```bash
npm run test:domain-governance
npm run validate:domain-governance
npm run harness:init-feature -- --slug checkout-ui --domains frontend
```


## Merge helper / release policy

Phase 8 adds `harness:merge`, a bounded merge-readiness and apply helper. It composes the slice lifecycle helper, PR gate evidence, PR review/comment state, local repo cleanliness, and optional explicit sync-main.

Useful commands:
```bash
npm run harness:merge -- check --pr <number>
npm run harness:merge -- apply --pr <number> --method squash
npm run harness:merge -- apply --pr <number> --method squash --sync-main
npm run validate:merge-helper
```

`harness:merge` is not deployment automation. It does not tag releases, publish changelogs, resolve merge conflicts, or sync local main unless `--sync-main` is explicitly supplied.

## Slice lifecycle assessment

Phase 6 adds an assess-first slice lifecycle helper that reads existing planning logs, coding logs, task state, git/branch evidence, PR submission summaries, PR-gate output, and sync-main evidence. It does not create a new mutable lifecycle state file.

Use it before create/submit/merge-ready claims:

```bash
npm run harness:slice-lifecycle -- status
npm run harness:slice-lifecycle -- check --stage create_ready
npm run validate:slice-lifecycle
npm run validate:domain-governance
```

Policy and docs live at `.pi/agent/lifecycle/slice-lifecycle-policy.json` and `.pi/agent/docs/slice_lifecycle.md`.

## Graphify evidence lifecycle drift guard
The Graphify evidence lifecycle is: explicit research queue-session orchestration -> graphifyEvidence in packet/handoff -> task_update validator consumption.
This lifecycle is bounded: metadata is optional, there is no global mandatory Graphify, no Graphify CLI --watch, daemon, or background behavior, and source verification remains required.

## Validation workflow
Use the validator script for repeatable Phase A/B checks:

```bash
cd /Users/subhajlimanond/dev/ma-code
./scripts/validate-phase-a-b.sh
```

Key outputs:
- **harness runbook (start here):** `.pi/agent/docs/harness_runbook.md` — end-to-end prescriptive guide (mental model → quick-reference cheat sheet → full lifecycle → 3 canonical workflows → invariants → troubleshooting)
- runtime validation runbook: `.pi/agent/docs/runtime_validation_runbook.md`
- operator workflow: `.pi/agent/docs/operator_workflow.md`
- validation reports: `reports/validation/`
  - scan validator reports in this order: `Summary Table` -> `Final Decision` -> `Detailed Results`
- current coding log pointer: `logs/CURRENT.md`
- local semantic fixture validator for HARNESS-051 slice 1: `scripts/validate-prompt-semantics.sh`
- bounded live-proof wrapper for HARNESS-051 slice 2: `scripts/validate-prompt-semantics-live.sh`
- semantic fixture inventory: `.pi/agent/validation/prompt-semantics.json`
- canonical Graphify validator: `scripts/validate-graphify-discovery.sh` (covers adapter proof plus discovery-policy selector coverage for Graphify fallback choices; `--smoke` adds one explicit installed-CLI proof)

Direct repo-root operator/package ergonomics:

Preferred unified operator front door:
```bash
npm install --no-package-lock
npm run harness:operator -- help
npm run harness:operator -- status
npm run harness:operator -- leases
npm run harness:operator -- queue-session -- --scope "bounded queue operation" --max-steps 3
npm run harness:operator -- worktree -- status
npm run harness:operator -- worker-session -- start --id HARNESS-064 --slug "worker lane"
```

Legacy operator commands remain supported:
```bash
npm run harness:status
npm run harness:leases
npm run harness:leases:json
npm run harness:leases -- clear-stale
npm run harness:queue-session -- --scope "bounded queue operation" --max-steps 3
npm run harness:schedules
npm run harness:package
npm run harness:worktree -- status
npm run harness:integrate -- --worktree ../ma-code-worktrees/example-branch
npm run harness:worker-session -- start --id HARNESS-064 --slug "worker lane"
npm run harness:worker-session -- status --scope harness-064
npm run harness:worker-session -- release --scope harness-064
npm run harness:pr-gate -- --pr 63 --max-attempts 20
npm run harness:sync-main
npm run harness:slice-lifecycle -- status
npm run harness:slice-lifecycle -- check --stage create_ready
npm run test:queue-runner
npm run test:core-workflows
npm run test:operator-surface
npm run test:operator-leases
npm run test:operator-control-plane
npm run test:queue-session
npm run test:scheduled-workflows
npm run test:worktree-helper
npm run test:integrate-worktree
npm run test:worker-session
npm run test:pr-gate
npm run test:sync-main
npm run test:harness-package
npm run validate:core-workflows
npm run validate:slice-lifecycle
npm run validate:graphify-discovery
npm run validate:prompt-contracts
npm run validate:prompt-semantics
npm run validate:prompt-semantics:live
npm run validate:harness-package
```

Lease inspection and stale-cleanup examples:
```bash
npm run harness:leases
npm run harness:leases:json
npm run harness:leases -- clear-stale
```

The preferred wrapper is intentionally thin: `harness:operator` delegates to the existing status, leases, queue-session, worktree, and worker-session scripts without changing runtime semantics. The legacy commands remain valid.

The lease helper is intentionally narrow: it lists current execution leases and `clear-stale` removes only already-expired/stale leases. Active lease force-clearing is not a default operator action; inspect status first and prefer waiting for expiry or resolving the owning run.

Bounded queue-session examples:
```bash
npm run harness:queue-session -- --scope "bounded queue operation" --max-steps 3
npm run harness:queue-session:json -- --scope "bounded queue operation" --max-steps 3 --max-runtime-seconds 30
node --import tsx scripts/harness-queue-session.ts --scope "bounded queue operation" --max-steps 2 --recent 3
```

That session summary now includes:
- explicit research-job Graphify orchestration evidence when a queued research job sets `graphifyOrchestration.enabled: true`
- duration and action counts
- started/finalized/blocked job IDs touched during the session
- remaining queued work count
- a recommended next action with operator-triage reasoning

Bounded scheduled workflow examples:
```bash
npm run harness:schedules
npm run harness:schedules:json
node --import tsx scripts/harness-scheduled-workflows.ts materialize --workflow repo-audit-run
node --import tsx scripts/harness-scheduled-workflows.ts materialize --workflow repo-audit-run --apply
```

Safe local main sync examples:
```bash
npm run harness:sync-main
npm run harness:sync-main:json
node --import tsx scripts/harness-sync-main.ts --json
```

The sync helper performs only a fast-forward update of local `main` from `origin/main`, preserves ignored runtime bookkeeping, and blocks when non-bookkeeping tracked dirt is present.

Safe local worktree-branch integration examples:
```bash
npm run harness:integrate -- --worktree ../ma-code-worktrees/harness-024-worktree-helpers
npm run harness:integrate:json -- --worktree ../ma-code-worktrees/harness-024-worktree-helpers --skip-validation
```

The integration helper is the bounded path for moving a validated linked worktree branch into local `main` with `--ff-only` semantics. It reuses worktree review-prep, acquires one integration lease, tolerates only narrow generated validation artifacts, and writes post-merge validator reports to temp paths instead of polluting the repo root.

Phase 0 durable bootstrap now also expects target repos to carry durable docs under `docs/`, including `docs/product/intake-policy.md` plus initiative templates under `docs/initiatives/TEMPLATE/` for major feature planning.

Harness package/bootstrap examples:
```bash
npm run harness:package
npm run harness:package:json
node --import tsx scripts/harness-package.ts bootstrap --dest /path/to/target-repo
npm run harness:product-intake -- --slug example-major-feature --description "Describe target users, outcome, and constraints" --dry-run
npm run harness:product-intake -- --slug example-major-feature --description "Describe target users, outcome, and constraints" --apply
npm run harness:init-feature -- --slug example-major-feature
npm run harness:issue-materialize -- dry-run --source docs/initiatives/greenfield-scaffold/source/approved-g-issues.json
npm run harness:afk-orchestrate -- dry-run --initiative greenfield-scaffold --max-parallel 1
npm run harness:afk-orchestrate -- apply --queue-only --initiative greenfield-scaffold
npm run harness:afk-orchestrate -- run --run --initiative greenfield-scaffold --max-steps 1 --max-runtime-seconds 30 --max-parallel 1
npm run harness:worker-execute -- dry-run --initiative greenfield-scaffold --job-id afk-greenfield-scaffold-issue-002
npm run harness:worker-execute -- run --initiative greenfield-scaffold --job-id afk-greenfield-scaffold-issue-002 --max-steps 4 --max-runtime-seconds 300 --stop-before-pr
npm run harness:pr-lifecycle -- dry-run --initiative greenfield-scaffold --worker-run-id worker-green
npm run harness:pr-lifecycle -- create --initiative greenfield-scaffold --worker-run-id worker-green --run-id pr-worker-green
npm run harness:pr-lifecycle -- gate --initiative greenfield-scaffold --run-id pr-worker-green
npm run harness:pr-lifecycle -- merge-ready --initiative greenfield-scaffold --run-id pr-worker-green
npm run harness:pr-lifecycle -- merge --initiative greenfield-scaffold --run-id pr-worker-green --allow-merge --approval-ref APPROVED --method squash
npm run harness:pr-lifecycle -- sync-main --initiative greenfield-scaffold --run-id pr-worker-green
npm run harness:screen-approval -- status --initiative example-major-feature --slice slice-001
npm run harness:screen-approval -- approve --initiative example-major-feature --slice slice-001 --by reviewer --note "Approved for FE implementation."
```

The bounded `harness:product-intake` helper is the safe Phase 1 entry point for major product work. Dry-run validates inputs and planned files without writing; apply captures `docs/initiatives/<feature-slug>/intake.json` and, only for clear intake, reuses `harness:init-feature` to scaffold PRD/backlog/decisions. PRD/backlog happen before Stitch; Phase 1 product intake never creates Stitch artifacts, task packets, queue jobs, frontend packets, or backend packets.

The `harness:screen-approval` helper is the safe Phase 5 gate after mock screen artifact generation. It writes only `docs/initiatives/<feature-slug>/screen-artifacts/<slice-id>.approval.json`, binds approval to the current artifact hash, and does not create Stitch calls, task packets, queue jobs, worker dispatch, frontend code, backend code, or protected runtime JSON.

The lower-level `harness:init-feature` helper scaffolds `docs/initiatives/<feature-slug>/` from the repo-local initiative templates and prints optional next-step suggestions for `/skill:g-grill`, `/skill:g-prd`, and `/skill:g-issues`.

Phase A issue materialization creates durable initiative issue artifacts only. Phase B AFK queue orchestration (`harness:afk-orchestrate`) reads those artifacts, applies dependency/HITL/validation/parallel-safety eligibility, requires declared HITL review artifacts to exist before honoring durable approvals, and can create queue-ready jobs through the queue-runner helper path with `queueJobSource: issue-materialization` provenance. Phase B has no daemon, hidden scheduler, free-roaming pickup, product-code implementation, or direct raw `.pi/agent/state/runtime/*.json` edit path; run mode requires explicit `--run`, `--max-steps`, `--max-runtime-seconds`, and `--max-parallel`.

Phase C bounded worker execution (`harness:worker-execute`) is the first foreground path that can execute one selected AFK queue job in an isolated git worktree. It refuses HITL/approval-required/missing-evidence jobs, records durable `docs/initiatives/<slug>/worker-runs/<run-id>.json` artifacts, preserves RED/GREEN/validation/review evidence, links queue jobs through `workerExecution`, and defaults to the `--stop-before-pr` boundary. `--allow-pr-create` requires an explicit approval reference, and the executor never auto-merges.

Phase D PR lifecycle automation (`harness:pr-lifecycle`) turns validated Phase C worker-run evidence into bounded PR lifecycle artifacts under `docs/initiatives/<slug>/pr-runs/`. It supports dry-run, create, gate, merge-ready, explicit merge, sync-main, and status. The default boundary is `--stop-before-merge`; merge requires `--allow-merge --approval-ref`, methods are constrained to `squash|merge|rebase`, and superseded PR closure requires `--close-approval-ref`. Failed or blocked lifecycle states remain visible in JSON and human-readable Markdown summaries.

See also:
- `.pi/agent/docs/harness_packaging_strategy.md`
- `.pi/agent/docs/harness_package_install.md`

Bounded worktree helper examples:
```bash
npm run harness:worktree -- branch-name --id HARNESS-024 --slug "worktree helpers"
npm run harness:worktree -- create --id HARNESS-024 --slug "worktree helpers"
npm run harness:worktree -- review-prep --path ../ma-code-worktrees/harness-024-worktree-helpers
npm run harness:worktree -- cleanup --path ../ma-code-worktrees/harness-024-worktree-helpers
```

Explicit worker-lane session examples:
```bash
npm run harness:worker-session -- start --id HARNESS-064 --slug "worker lane"
npm run harness:worker-session:json -- status --scope harness-064
npm run harness:worker-session -- release --scope harness-064
npm run harness:worker-session -- release --scope harness-064 --cleanup
```

Worker sessions differ from queue sessions: a worker session owns a worker-lane lease plus a git worktree for isolated work; it does not auto-dispatch queue jobs or run a worker engine. Cleanup remains explicit and conservative, and dirty worktrees are not removed.

PR CI/security gate helper examples:
```bash
npm run harness:pr-gate -- --pr 63 --max-attempts 20
npm run harness:pr-gate:json -- --pr 63 --once
```

The PR gate helper polls `gh pr checks` without `--watch`; default polling waits 180 seconds between attempts and reports CI/security checks plus review/comment triage.

Operator docs:
- **`.pi/agent/docs/harness_runbook.md`** — definitive end-to-end runbook (start here)
- `.pi/agent/docs/operator_manual.md`
- `.pi/agent/docs/operator_quickstart.md`
- `.pi/agent/docs/operator_workflow.md`
- `.pi/agent/docs/operator_install_guide.md`

Dedicated core workflow validator:
```bash
./scripts/validate-core-workflows.sh
```

Thinking-first tuning report from bounded local timing/cost-ish evidence:
```bash
./scripts/collect-harness-tuning-data.sh
```

That report now combines:
- harness-routing validator timings
- queue-runner validator timings
- core workflow validator timings
- scheduled workflow dry-run helper timings
- role-level cost-ish index summaries from `.pi/agent/models.json`

## GitHub automation
This repo uses a harness-specific GitHub baseline rather than app-specific deployment pipelines.

Current GitHub workflow surfaces:
- CI: `.github/workflows/ci.yml`
  - repo static checks (including executable prompt/template contract validation)
  - foundation extension compile check
  - queue-semantics validator
  - skill-routing validator
  - harness-routing validator
  - team-activation validator
  - task-packets validator
  - handoffs validator
  - same-runtime bridge validator
  - recovery-policy validator
  - recovery-runtime validator
  - queue-runner validator (`--skip-live` in CI; local/operator runs attempt one bounded live probe by default when possible)
  - core-workflows validator
- Security: `.github/workflows/security.yml`
  - dependency review on PRs
  - CodeQL analysis for JavaScript/TypeScript
- Dependency updates: `.github/dependabot.yml`

### Phase 11 product pipeline runtime

Phase 11 adds `harness:product-pipeline`, an additive operator-visible flow from initiative artifacts to a bounded slice execution plan.

```bash
npm run harness:product-pipeline -- dry-run --initiative checkout-ui --json
npm run harness:product-pipeline -- apply --initiative checkout-ui --max-parallel 1
npm run harness:product-pipeline -- status --initiative checkout-ui
npm run harness:operator -- product-pipeline dry-run --initiative checkout-ui
npm run validate:product-pipeline
```

Dry-run writes no files and shows the slice DAG, HITL gates, sequential phase order, and Phase 10 parallel decisions. Apply performs one bounded foreground materialization step, stops at HITL gates, and writes only a durable pipeline run artifact under `docs/initiatives/<slug>/pipeline-runs/`. It creates no runtime tasks, queue jobs, worker sessions, handoffs, daemon, or product code. Intra-slice phases remain sequential; cross-slice parallelism requires Phase 10 `parallelAllowed: true` proof.

## Phase 14 product pipeline E2E pilot

Phase 14 is validated by `.pi/agent/docs/product_pipeline_e2e_pilot.md` and `./scripts/validate-product-pipeline-e2e.sh`. The pilot uses the `checkout-mini` fixture in temp repos, writes Markdown/JSON reports under `reports/validation/`, proves success and blocked paths, keeps HITL `waiting_for_human` gates visible, and introduces no daemon/watch mode, no live provider/Stitch call by default, no protected runtime JSON mutation, and no product implementation code outside temp fixtures.

## Phase 4 master orchestrator bounded run session

Phase 1 added a read-only classifier. Phase 2 added a delegated dry-run planner. Phase 3 added a bounded apply/materialize router that delegates exactly one allowlisted helper command and verifies reported `createdFiles` against explicit write-path allowlists. Phase 4 adds a bounded foreground `run` session for exactly one lane: `queue_level`, `worker_job`, or `parallel_lanes`.

```bash
npm run harness:orchestrate -- classify --goal "Build checkout mini flow" --json
npm run harness:orchestrate -- context --initiative greenfield-scaffold --goal "continue greenfield scaffold AFK issues" --json
npm run harness:orchestrate -- dry-run --goal "Build checkout flow for shoppers to place orders and complete payments so the team can validate order confirmation acceptance" --json
npm run harness:orchestrate -- apply --path stitch_prompt --initiative checkout --slice slice-001 --json
npm run harness:orchestrate -- run --initiative greenfield-scaffold --max-steps 3 --max-runtime-seconds 300 --json
npm run harness:operator -- orchestrate apply --path screen_approval --action approve --initiative checkout --slice slice-001 --approval-ref human-123 --by reviewer --note "Approved" --json
npm run harness:operator -- orchestrate run --initiative greenfield-scaffold --max-steps 3 --max-runtime-seconds 300 --json
```

The dry-run planner writes no orchestrator files, returns `writesFiles: false`, creates no tasks or queue jobs, creates no PRs, and performs no merge. The apply router is materialization-only: it rejects generic command strings, worker execution, PR creation, merge, sync-main, raw git, and direct `.pi/agent/state/runtime/*.json` edits. Allowlisted apply paths include product intake, issue materialization, product pipeline, Stitch prompt/artifact, screen approval, slice contract, FE/BE packets, and AFK queue materialization with mandatory `--queue-only`. The Phase 4 run session requires `--max-steps` and `--max-runtime-seconds`, blocks dirty/protected repo state before delegation, records `merge.attempted: false`, and never merges by default. See `.pi/agent/docs/master_orchestrator.md`.

### Master orchestrator evidence and merge handoff
The repo/initiative context preflight reports `repoContext`, `initiativeMaturity`, `greenfieldEligible`, `safeNextModes`, and `blockedModes` before operators assume greenfield behavior; an initiative slug such as `greenfield-scaffold` is label-only and does not prove the current repo is greenfield.

Phase 5 adds evidence-first merge handoff commands. `npm run harness:orchestrate -- evidence --initiative <slug> --run-id <id> --json` consumes existing initiative/lifecycle/log artifacts and stops before merge. `merge-check` delegates to `harness:merge check`. `merge-apply` requires `--approval-ref <ref>` and delegates only to `harness:merge` after a ready check; raw git merge is never part of the orchestrator path.
