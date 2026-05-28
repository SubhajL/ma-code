# Pi-harness Runbook

**Audience:** new operators (humans and LLMs) who need to drive the harness end-to-end without having read all 11 `operator_*.md` docs and 9 ADRs first.

**What this is:** the prescriptive single-source runbook. It tells you which commands to run in which order, what each step is for, and where to look when something goes wrong. It cross-links to the topic-specific docs and ADRs for deeper context — it does not duplicate them.

**What this is NOT:** authoritative for any decision an ADR records. When this runbook and an ADR disagree, **the ADR wins** and this runbook is wrong; open a PR to fix it. See [`docs/adr/README.md`](../../../docs/adr/README.md).

---

## 1. Mental model in 90 seconds

The Pi-harness is a **repo-local, bounded-autonomy coding harness**. Five properties define it (all enforced in code, not aspiration):

1. **Bounded autonomy** ([ADR-0002](../../../docs/adr/0002-bounded-autonomy.md)) — no daemons, no hidden schedulers. Every multi-step op requires explicit `--max-steps` + `--max-runtime-seconds`. PR-create and merge boundaries require `--allow-merge --approval-ref`. The default for any unbounded request is to stop at the first hard boundary and surface a typed `waiting_for_human` / `blocked` state, never silent retry.
2. **Canonical SQLite state** ([ADR-0001](../../../docs/adr/0001-runtime-state-is-sqlite.md)) — all runtime state lives in `.pi/agent/state/runtime/pi.db`. The legacy JSON files (`tasks.json`, `queue.json`, `leases.json`) auto-migrate on first use. The JSONL audit log (`logs/harness-actions.jsonl`) is a debug mirror only.
3. **Atomic coupled mutations** ([ADR-0003](../../../docs/adr/0003-atomic-queue-task-mutations.md)) — queue+task changes go through one SQLite transaction via `withAtomicQueueAndTasksMutation`. No half-applied state on crash.
4. **Typed control-plane kernel** ([ADR-0005](../../../docs/adr/0005-typed-control-plane-kernel.md)) — new control-plane mutations declare a `ControlPlaneCommandSpec<Name, Input, Value>` and return a discriminated-union `ControlPlaneResult` (`ok | blocked | failed`).
5. **Typed validator reports** ([ADR-0007](../../../docs/adr/0007-typed-validator-report-contract.md) + [ADR-0008](../../../docs/adr/0008-rich-schema-per-validator-emitters.md)) — every JSON-emitting validator writes through a typed contract; consumers can rely on `{status, failedChecks, checks}` (generic) or the validator's rich-schema sibling (e.g., product-pipeline-e2e).

Three repo locations matter:

| Path | What lives there |
|---|---|
| Repo root (`AGENTS.md`, `SYSTEM.md`, `docs/adr/`) | Governance: rules every agent must obey + load-bearing decisions |
| `.pi/agent/...` | Repo-local harness: extensions, prompts, schemas, state, packets, handoffs, runbooks |
| `scripts/` | Operator CLI surface: ~50 `harness:*` npm scripts |

Work flows through a series of **bounded phases**. Each phase has a `dry-run` mode (writes nothing), an `apply` mode (writes one artifact), and gates blocking the next phase until evidence exists. The whole pipeline is operator-driven; nothing advances without a human or scripted command saying "advance one bounded step."

```
goal ──▶ classify ──▶ dry-run ──▶ apply ──▶ run (bounded)
            └─ master orchestrator (MO) ─┘

Phases 1–11 of the product pipeline:
  product_intake → slice_plan → stitch_prompt → screen_artifact →
  screen_approval (HITL) → slice_contract →
  frontend_packet → frontend_validation →
  backend_packet → backend_validation →
  quality_readiness → parallel_worker_lanes (Phase 10)

Per-issue execution:
  Phase A (issue-materialize) → Phase B (afk-orchestrate) →
  Phase C (worker-execute) → PR lifecycle → merge → sync-main
```

---

## 2. Quick-reference cheat sheet

### Top-of-session health check (always run first)

```bash
npm run harness:doctor      # read-only state-of-the-world (SQLite tables, schemas, audit log)
npm run harness:status      # queue + tasks + leases summary
npm run harness:leases      # who holds which scope
```

### "What command does X?"

| You want to… | Run |
|---|---|
| Check harness health | `npm run harness:doctor` |
| See queue + tasks + leases | `npm run harness:status` |
| Run a bounded queue session | `npm run harness:queue-session` |
| Inspect leases / clear stale ones | `npm run harness:leases [-- clear-stale]` |
| Classify a goal into a phase lane | `npm run harness:orchestrate -- classify --goal "<text>" --json` |
| Dry-run a phase artifact (no writes) | `npm run harness:orchestrate -- dry-run --goal "<text>" --json` |
| Write one phase artifact | `npm run harness:orchestrate -- apply --path <phase> --initiative <slug> --json` |
| Bounded multi-step MO run | `npm run harness:orchestrate -- run --initiative <slug> --max-steps N --max-runtime-seconds N --json` |
| Scaffold a new initiative | `npm run harness:init-feature -- --slug <slug> --domains <list>` |
| Materialize issues from slice-plan | `npm run harness:issue-materialize -- apply --initiative <slug>` |
| Queue eligible AFK issues | `npm run harness:afk-orchestrate -- apply --queue-only --initiative <slug>` |
| Execute one queued job | `npm run harness:worker-execute -- run --initiative <slug> --job-id <id> --max-steps N --max-runtime-seconds N` |
| Check slice-lifecycle gate | `npm run harness:slice-lifecycle -- check --stage create_ready\|merge_ready` |
| Pre-merge PR gate | `npm run harness:pr-gate` |
| Open a PR | `npm run harness:pr-lifecycle -- create --initiative <slug> --worker-run-id <wr> --run-id <pr>` |
| Merge a PR (HUMAN GATE) | `npm run harness:pr-lifecycle -- merge --initiative <slug> --run-id <pr> --allow-merge --approval-ref <ref>` |
| Fast-forward local main | `npm run harness:sync-main` |
| Post-merge cleanup | `npm run harness:integrate` |
| Install harness into another repo | `npm run harness:install -- --dest <path>` |
| One central dispatch help | `npm run harness:operator -- --help` |

### "When something looks wrong…"

| Symptom | First diagnosis | Common fix |
|---|---|---|
| `harness:doctor` reports `sqlite-runtime-db` missing | DB not yet initialized in this checkout | Run any harness command (e.g., `npm run harness:status`) once — DB initializes lazily |
| Queue says "blocked" with active lease | `npm run harness:leases` | `npm run harness:leases -- clear-stale` ONLY if expired; never force-clear active leases |
| Tests fail with `ERR_MODULE_NOT_FOUND` in temp runtime | Validator missed copying a new module | Check `scripts/validate-extension-unit-tests.sh` `setup_temp_runtime` — wildcard `cp` is the auto-discovery safety net |
| PR won't merge | `npm run harness:pr-gate` | Inspect required checks, requested changes, blocking comments, draft state, merge-release-policy |
| Worker hit max-steps | `npm run harness:worker-execute -- explain-run --run-id <id>` | `worker-execute resume` with fresh `--max-steps` / `--max-runtime-seconds` |
| `STITCH_API_KEY` leaking into tests | Shell env var set | Tests should pass `env: {}`; if you wrote a new one, follow the pattern in `tests/extension-units/live-stitch-adapter.test.ts` |
| Don't know what's available | `npm run harness:operator -- --help` | Central dispatch with subcommand help |
| Don't know what changed | `git log --oneline -10` plus `logs/harness-actions.jsonl` | Audit log records every state mutation |
| Architectural drift | `docs/adr/README.md` | When in doubt, the ADR wins |

---

## 3. End-to-end lifecycle (the full picture)

### Step 0 — health check before any session

```bash
npm run harness:doctor
npm run harness:status
```

If doctor reports FAIL, fix that first. Don't proceed with stale state.

### Step 1 — Master Orchestrator: classify → dry-run → apply

The MO turns a free-form goal into typed phase artifacts. See [`master_orchestrator.md`](./master_orchestrator.md) for the full semantics.

```bash
# 1a. Classify: tell the MO what you want
npm run harness:orchestrate -- classify \
  --goal "Build checkout summary screen with loading, empty, error, success states" \
  --json

# 1b. Dry-run: preview the planning artifact (writes nothing)
npm run harness:orchestrate -- dry-run \
  --goal "Build checkout flow for shoppers to place orders and complete payments" \
  --json

# 1c. Apply: write ONE artifact for ONE phase
npm run harness:orchestrate -- apply \
  --path stitch_prompt \
  --initiative checkout-mini \
  --slice slice-001 \
  --json
```

**Hard rule:** `apply` writes one phase artifact at a time. Phases with HITL gates (e.g., `screen_approval`) require explicit `--approval-ref` and `--by` arguments. Skipping a HITL gate is rejected before any state mutation.

### Step 2 — Initiative scaffold

Phase artifacts and downstream work all live under `docs/initiatives/<slug>/`. Scaffold a new initiative from the TEMPLATE:

```bash
npm run harness:init-feature -- --slug checkout-mini --domains frontend,backend
```

Standard files that populate as phases run:

```
docs/initiatives/<slug>/
├── intake.json                # phase 1 (product_intake)
├── prd.md                     # phase 1
├── backlog.md                 # phase 2 (slice_plan)
├── stitch-prompts/            # phase 3
├── screen-artifacts/          # phase 4 + 5 (artifact + HITL approval)
├── contracts/                 # phase 6 (slice_contract)
├── packets/                   # phase 7 + 9 (FE + BE packets)
├── validation/                # phase 8 + 10 (FE + BE validation)
├── quality/                   # phase 11 (quality_readiness)
├── issues.json                # Phase A output
├── slice-plan.json
├── pipeline.json
├── slices/<issue-id>.summary.json
├── afk-runs/<run-id>.json     # Phase B output
├── worker-runs/<run-id>.json  # Phase C output
└── logs/                      # narrative coding logs
```

### Step 3 — Phase A: materialize issues

Once `slice-plan.json` exists, materialize per-issue summaries:

```bash
npm run harness:issue-materialize -- dry-run --initiative checkout-mini --json
npm run harness:issue-materialize -- apply  --initiative checkout-mini --json
```

This writes `issues.json` and `slices/<issue-id>.summary.json` files. Each issue carries: acceptance criteria, validation proof, allowed paths, domains, dependencies, HITL flags.

### Step 4 — Phase B: AFK queue orchestration

`harness:afk-orchestrate` is the ONLY sanctioned path to materialize queue jobs from issues. It enforces eligibility (no HITL, deps `done`/`approved`, acceptance + validation proof, allowed paths, valid domain). See [`afk_queue_orchestration.md`](./afk_queue_orchestration.md).

```bash
# 4a. Preview eligibility (writes nothing)
npm run harness:afk-orchestrate -- dry-run --initiative checkout-mini --max-parallel 1
# Use --explain <issue-id> to see WHY an issue is or isn't eligible.

# 4b. Enqueue (writes queue_jobs rows + an afk-runs/<run-id>.json artifact)
npm run harness:afk-orchestrate -- apply --queue-only --initiative checkout-mini

# 4c. Bounded run — when you want the queue to advance one job
npm run harness:afk-orchestrate -- run --run \
  --initiative checkout-mini \
  --max-steps 1 \
  --max-runtime-seconds 30 \
  --max-parallel 1
```

**Boundary:** Phase B never creates product-code commits, never calls worker engines directly, never edits runtime state outside the queue-runner helper.

### Step 5 — Queue operator loop (continuous)

The queue is the human-controllable interface while work is enqueued. From a Pi session, use the runtime tools (`inspect_queue_state`, `pause_queue`, `resume_queue`, `stop_queue_safely`, `run_next_queue_job`, `run_bounded_queue_session`). From a shell, the wrappers are:

```bash
npm run harness:status
npm run harness:queue-session         # bounded-session helpers
```

For lease issues:

```bash
npm run harness:leases                  # who holds queue-session, worker, etc.
npm run harness:leases -- clear-stale   # ONLY for already-expired/stale leases
                                        # NEVER force-clear active leases
```

See [`operator_workflow.md`](./operator_workflow.md) for the daily-loop discipline.

### Step 6 — Phase C: worker execution (one queue job → branch + commits)

Picks one queued job, runs the worker in a bounded session, produces an evidence bundle. Default `--stop-before-pr` means the worker stops with branch + commits ready BEFORE opening a PR.

```bash
# 6a. Preview
npm run harness:worker-execute -- dry-run \
  --initiative checkout-mini \
  --job-id afk-checkout-mini-issue-001 \
  --json

# 6b. Run (with explicit bounds)
npm run harness:worker-execute -- run \
  --initiative checkout-mini \
  --job-id afk-checkout-mini-issue-001 \
  --max-steps 10 \
  --max-runtime-seconds 1800 \
  --implementation-command "npm test -- --runInBand" \
  --validation-command "npm run validate:product-pipeline" \
  --json

# 6c. If the run hit max-steps, resume
npm run harness:worker-execute -- resume \
  --initiative checkout-mini \
  --run-id <run-id> \
  --max-steps 5 \
  --max-runtime-seconds 600

# 6d. Inspect
npm run harness:worker-execute -- explain-run \
  --initiative checkout-mini \
  --run-id <run-id> \
  --json
```

Each run writes `worker-runs/<run-id>.json` with the full evidence bundle: changed files, RED/GREEN diffs, validator output, commits, review verdict, branch name, lifecycle stage reached.

### Step 7 — Slice-lifecycle gate before PR (or merge)

Before claiming `create_ready` (branch + commits) or `merge_ready`:

```bash
npm run harness:slice-lifecycle -- status
npm run harness:slice-lifecycle -- check --stage create_ready
npm run harness:slice-lifecycle -- check --stage merge_ready --json
npm run harness:slice-lifecycle -- check --stage merge_ready \
  --evidence-file reports/lifecycle/<task-id>.merge-evidence.json --json
```

The helper reads logs/task/git/PR-gate/sync-main evidence and reports the current checkpoint, missing prerequisites, blocking gaps. **The lifecycle helper is not a bypass** — missing evidence still blocks the stage.

### Step 8 — PR lifecycle: create → gate → merge → sync-main

`--stop-before-merge` is the DEFAULT boundary. Without `--allow-merge --approval-ref`, the lifecycle stops at `merge_ready` and waits for a human.

```bash
# 8a. Preview
npm run harness:pr-lifecycle -- dry-run \
  --initiative checkout-mini \
  --worker-run-id <run-id> \
  --json

# 8b. Create the PR (requires worker-run evidence)
npm run harness:pr-lifecycle -- create \
  --initiative checkout-mini \
  --worker-run-id <run-id> \
  --run-id <pr-run-id> \
  --title "feat(checkout): summary screen states" \
  --body "<auto-generated body>" \
  --json

# 8c. Pre-merge gate
npm run harness:pr-lifecycle -- gate \
  --initiative checkout-mini \
  --run-id <pr-run-id> \
  --json
# OR the standalone:
npm run harness:pr-gate

# 8d. Merge — REQUIRES explicit --allow-merge --approval-ref
npm run harness:pr-lifecycle -- merge \
  --initiative checkout-mini \
  --run-id <pr-run-id> \
  --allow-merge \
  --approval-ref human-approval-<id> \
  --method squash \
  --json

# 8e. Pull main fast-forward
npm run harness:pr-lifecycle -- sync-main \
  --initiative checkout-mini \
  --run-id <pr-run-id> \
  --json
# OR:
npm run harness:sync-main
```

### Step 9 — Post-merge integration

```bash
npm run harness:integrate         # full integration helper
npm run harness:worktree status   # see active worktrees
```

Integration handles untracked validator reports, drops the worktree, prunes branches.

---

## 4. Three canonical workflows

### Workflow A — Greenfield feature development (AFK)

**When to use this:** you have a feature idea and want an end-to-end run from intake to merged PR, with humans gating only the screen approval and final merge.

```bash
# 1. Health check
npm run harness:doctor && npm run harness:status

# 2. Scaffold
npm run harness:init-feature -- --slug checkout-mini --domains frontend,backend

# 3. Master Orchestrator — phases 1–7
npm run harness:orchestrate -- classify --goal "checkout summary: loading/empty/error/success" --json
npm run harness:orchestrate -- dry-run  --goal "..." --json     # review the plan
npm run harness:orchestrate -- apply --path product_intake --initiative checkout-mini --json
npm run harness:orchestrate -- apply --path slice_plan      --initiative checkout-mini --json
npm run harness:orchestrate -- apply --path stitch_prompt   --initiative checkout-mini --slice slice-001 --json

# 4. Screen artifact + HITL approval (human gate)
npm run harness:stitch-artifact -- apply --initiative checkout-mini --slice slice-001 --json
npm run harness:operator -- orchestrate apply \
  --path screen_approval --action approve \
  --initiative checkout-mini --slice slice-001 \
  --approval-ref human-001 --by alice --note "States match brief" --json

# 5. Slice contract → FE + BE packets
npm run harness:slice-contract -- apply --initiative checkout-mini --slice slice-001 --json
npm run harness:fe-packet      -- apply --initiative checkout-mini --slice slice-001 --json
npm run harness:be-packet      -- apply --initiative checkout-mini --slice slice-001 --json

# 6. Phase A — materialize issues
npm run harness:issue-materialize -- apply --initiative checkout-mini --json

# 7. Phase B — queue eligible issues
npm run harness:afk-orchestrate -- dry-run --initiative checkout-mini --max-parallel 1
npm run harness:afk-orchestrate -- apply --queue-only --initiative checkout-mini

# 8. Phase C — execute one queued issue (bounded)
npm run harness:worker-execute -- run \
  --initiative checkout-mini --job-id <queued-job-id> \
  --max-steps 10 --max-runtime-seconds 1800 \
  --validation-command "npm run validate:product-pipeline-e2e" \
  --json

# 9. Pre-merge gate
npm run harness:slice-lifecycle -- check --stage merge_ready --json

# 10. PR lifecycle (HITL merge gate)
npm run harness:pr-lifecycle -- create  --initiative checkout-mini --worker-run-id <wr> --run-id <pr> --json
npm run harness:pr-lifecycle -- gate    --initiative checkout-mini --run-id <pr> --json
npm run harness:pr-lifecycle -- merge   --initiative checkout-mini --run-id <pr> \
  --allow-merge --approval-ref human-merge-001 --method squash --json
npm run harness:pr-lifecycle -- sync-main --initiative checkout-mini --run-id <pr> --json

# 11. Integration
npm run harness:integrate
```

**Human gates** in this workflow: screen approval (step 4), merge approval (step 10). Everywhere else is bounded automation.

### Workflow B — Codebase review and improvement (initiative-driven)

**When to use this:** you want to do an as-is review of a subsystem and ship the improvements as small focused PRs. This is the pattern the harness-cleanup initiative used across PRs #178–#247.

```bash
# 1. Doctor + status
npm run harness:doctor && npm run harness:status

# 2. Run an architecture review via the g-review skill (in a Pi session)
#    Templates available:
#      .pi/agent/prompts/templates/request-architecture-review.md
#      .pi/agent/prompts/templates/assess-drift-capability.md
#      .pi/agent/prompts/templates/propose-migration-path.md

# 3. Create an initiative for the review's output
mkdir -p docs/initiatives/<my-cleanup>
cp docs/initiatives/TEMPLATE/*.md docs/initiatives/<my-cleanup>/
# Author:
#   architectural-review.md  (the lead's findings, with status tables)
#   tier-1-status.md         (focused tracker for "do soon")
#   coverage-audit.md        (reachability / test-coverage map)
# See docs/initiatives/harness-cleanup/ for the exemplar.

# 4. Classify each finding by tier:
#    Tier 0 — invariants/visibility (typecheck baseline, doctor, audit)
#    Tier 1 — do-soon (architectural fixes)
#    Tier 2 — do-this-quarter (consolidation, refactor)
#    Tier 3 — when-convenient (cosmetic or scope-checked only)

# 5. Pick ONE Tier item. Use the g-coding skill for TDD implementation
#    (in a Pi session):
#    - Phase 1: gather context (Read CLAUDE.md, AGENTS.md, relevant tests)
#    - Phase 3: stub → test (RED) → implement (GREEN) → typecheck → lint
#    - Phase 4c: 3x flakiness check
#    - Phase 5: /code-review (medium effort) — BLOCKING gate before commit
#    - Phase 7: commit + PR + admin-merge

# 6. Write an ADR for each load-bearing decision
#    Lifecycle: Proposed → Accepted; dated; with Context / Decision /
#    Consequences / Notes. Update docs/adr/README.md index.
#    See docs/adr/0001 through 0009 for exemplars.

# 7. Validate before commit
npm run typecheck
bash scripts/check-repo-static.sh
# Run only the validators affected by your change:
npm run validate:harness-package          # if you touched harness-package
npm run validate:extension-unit-tests
# ... etc.

# 8. Land via standard PR + admin-merge
git checkout -b feat/<slug>
git commit -m "<conventional commit>"
git push -u origin feat/<slug>
gh pr create --title "..." --body "..."
gh pr merge <PR#> --squash --admin --delete-branch
git checkout main && git pull --ff-only
```

**Key principle (from PRs #178–#247):** one PR per decision, ADR for the load-bearing ones, scope-check entries for "considered and intentionally deferred." The initiative tracker docs (`architectural-review.md`, `tier-1-status.md`) are the single source of truth across PRs.

### Workflow C — Demo / pilot evaluation (no production code)

**When to use this:** a new team is evaluating the harness and wants to see every phase, every HITL gate, and every blocker path without writing real code.

```bash
# 1. Health check + inspect the fixture
npm run harness:doctor
ls tests/fixtures/product-pipeline-e2e/checkout-mini/
cat tests/fixtures/product-pipeline-e2e/checkout-mini/expected-artifacts.json

# 2. Run the E2E pilot validator — exercises the full pipeline against
#    the fixture in a tmp repo. Proves both success paths AND deliberate
#    blocked paths.
npm run validate:product-pipeline-e2e
# Outputs:
#   reports/validation/<date>_product-pipeline-e2e.md   — human report
#   reports/validation/<date>_product-pipeline-e2e.json — typed JSON
#
# The JSON includes:
#   phases[]            — 11 phases, each with status + artifacts + evidence
#   hitlGatesProven     — which HITL gates were exercised
#   blockedPathsProven  — 7 deliberate blocked scenarios (vague intake,
#                         missing screen approval, stale approval hash,
#                         failed FE/BE validation, missing Phase 10 proof,
#                         waiting_for_human)
#   idempotency         — re-runs produce no duplicate artifacts
#   safety              — liveProviderCalls=0, daemonOrWatchModeIntroduced=false

# 3. Demo the operator surfaces interactively:
npm run harness:status
npm run harness:queue-session
npm run harness:slice-lifecycle -- status
npm run harness:orchestrate -- classify --goal "demo goal" --json
npm run harness:orchestrate -- dry-run  --goal "<longer goal>" --json

# 4. Demo a blocked HITL path — try to skip screen_approval:
npm run harness:orchestrate -- apply --path slice_contract \
  --initiative checkout-mini --slice slice-001 --json
# → REJECTS with a "waiting_for_human" blocker pointing at screen_approval

# 5. Demo doctor catching state drift:
echo '{"broken": "json"}' > .pi/agent/state/runtime/tasks.json
npm run harness:doctor   # runtime-state check reports FAIL with a clear msg
rm .pi/agent/state/runtime/tasks.json
npm run harness:doctor   # back to PASS

# 6. Demo the validator framework — show the typed contracts:
cat scripts/lib/emit-validator-report.ts         # generic emitter
cat scripts/lib/emit-product-pipeline-e2e-report.ts  # rich-schema sibling
cat docs/adr/0007-typed-validator-report-contract.md
cat docs/adr/0008-rich-schema-per-validator-emitters.md

# 7. Tear-down: no state to clean. validate-product-pipeline-e2e.sh
#    removes its temp repo on exit unless --keep-temp was passed.
```

**What this demo proves:** (a) the pipeline is deterministic and resumable, (b) HITL gates actually block, (c) blocked paths surface structured next-actions rather than silent failures, (d) no live provider calls happen without explicit opt-in, (e) the entire pipeline is exercised without touching production code.

---

## 5. Operator invariants (never do these)

These are hard rules. Violating any of them either breaks the harness or invalidates evidence:

1. **Never bypass HITL gates.** If a phase requires `--approval-ref` + `--by`, you cannot run a downstream phase by inventing fake refs. The MO's `apply` rejects this; respect the rejection.
2. **Never force-clear an active lease.** `npm run harness:leases -- clear-stale` is for ALREADY-EXPIRED leases only. Clearing an active lease can corrupt queue state.
3. **Never merge without `--allow-merge --approval-ref`.** The default boundary is `--stop-before-merge`. The flag pair is the durable human-approval signal.
4. **Never `git checkout main` from inside a worktree.** Worktrees can only check out branches that aren't held elsewhere. The shared main repo's worktree is the canonical home for `main`; other worktrees must `git fetch origin` and stay on their feature branch.
5. **Never run a multi-step harness operation without `--max-steps` AND `--max-runtime-seconds`.** Bounded autonomy isn't optional. Operations without explicit bounds will refuse to start (or stop at the first hard boundary).
6. **Never edit `.pi/agent/state/runtime/{tasks,queue,leases}.json` directly.** They're auto-migrating compatibility files; the canonical store is `pi.db`. Use `task_update` / `run_next_queue_job` / `harness:leases` instead.
7. **Never skip the validator before claiming completion.** A task can be marked `done` only with passing validation evidence. The till-done extension enforces this in `task_update`.
8. **Never widen scope silently inside a PR.** If a fix needs collateral changes, surface them in the PR body or split into a follow-up. The `simplify` / `code-review` skills will catch this.
9. **Never commit changes without explicit user approval.** AGENTS.md is clear: commit only when asked.
10. **When in doubt, the ADR wins.** If this runbook contradicts an ADR, the ADR is right and this runbook is wrong — open a PR to fix the runbook.

---

## 6. Troubleshooting decision tree

```
Something looks wrong
  │
  ├─ Is the queue stuck?
  │    ├─ npm run harness:status
  │    │    ├─ "blocked job" → resolve the blocker (read the detail field), then resume_queue
  │    │    ├─ "active lease" → npm run harness:leases
  │    │    │    ├─ Lease expired → npm run harness:leases -- clear-stale
  │    │    │    └─ Lease active → DO NOT force-clear; find the holder
  │    │    └─ "no work" → check phase artifacts under docs/initiatives/<slug>/
  │    └─ Still stuck → npm run harness:doctor (look for sqlite-* fails)
  │
  ├─ Is a validator failing?
  │    ├─ Run it directly, read reports/validation/<date>_*.{md,json}
  │    ├─ Check if it's a pre-existing failure on main (git stash; rerun; restore)
  │    └─ For env-leakage flakes (live API keys, ports): use env: {} in tests
  │
  ├─ Did the worker hit a limit?
  │    ├─ npm run harness:worker-execute -- explain-run --run-id <id>
  │    └─ Resume: npm run harness:worker-execute -- resume --run-id <id> --max-steps N --max-runtime-seconds N
  │
  ├─ Can't merge a PR?
  │    ├─ npm run harness:pr-gate
  │    ├─ Check: required checks, requested changes, blocking comments, draft state
  │    └─ Confirm: merge-release-policy required lifecycle stage + PR-gate state
  │
  ├─ State drift / unexpected file shape?
  │    ├─ npm run harness:doctor (read-only diagnosis)
  │    └─ Check ADR-0001 (SQLite source-of-truth) and ADR-0003 (atomic mutations)
  │
  └─ Architectural disagreement / unclear precedence?
       ├─ Read docs/adr/README.md
       └─ When in doubt, the ADR wins; if no ADR covers the case, the senior team
         either writes one or accepts the existing behavior as the new ADR.
```

For deep-dive troubleshooting beyond this tree, see [`operator_troubleshooting_guide.md`](./operator_troubleshooting_guide.md).

---

## 7. Where to look next

Reading order if you're new (after this runbook):

1. [`README.md`](../../../README.md) — what's implemented, what's intentionally NOT implemented
2. [`AGENTS.md`](../../../AGENTS.md) — core operating rules every agent must obey
3. [`docs/adr/README.md`](../../../docs/adr/README.md) + every ADR (0001–0009) — load-bearing decisions; authoritative when other docs disagree
4. [`operator_workflow.md`](./operator_workflow.md) — daily-loop discipline
5. [`master_orchestrator.md`](./master_orchestrator.md) — classify / dry-run / apply / run semantics
6. [`afk_queue_orchestration.md`](./afk_queue_orchestration.md) — Phase B eligibility + run contract
7. [`product_pipeline_runtime.md`](./product_pipeline_runtime.md) — phase semantics + HITL gates
8. [`operator_safety_rules.md`](./operator_safety_rules.md) — safety boundary + audit log
9. [`operator_install_guide.md`](./operator_install_guide.md) — install into another repo
10. [`operator_troubleshooting_guide.md`](./operator_troubleshooting_guide.md) — deep-dive symptoms / fixes
11. [`docs/initiatives/harness-cleanup/architectural-review.md`](../../../docs/initiatives/harness-cleanup/architectural-review.md) — exemplar review-driven initiative
12. [`tests/fixtures/product-pipeline-e2e/checkout-mini/`](../../../tests/fixtures/product-pipeline-e2e/checkout-mini/) — the demo fixture

Skills (use the Skill tool in a Pi session):

- `g-coding` — TDD implementation workflow
- `g-planning` — comprehensive execution plans
- `g-check` — review / verification / quality fixes
- `g-review` — architecture, drift, as-is system review
- `g-create` / `g-grill` / `g-issues` / `g-prd` / `g-refactor` / `g-submit` — domain-specific helpers
- `/code-review` — diff QCHECK at chosen effort level (low/medium/high/ultra)

When you find this runbook out of date — fix it. The runbook is part of the harness, not external documentation; the same PR discipline that applies to code applies here.
