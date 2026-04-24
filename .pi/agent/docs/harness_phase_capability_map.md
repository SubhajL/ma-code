# Harness Phase Capability Map

This document translates the implementation backlog into a practical answer to one question:

> After each phase, what capability do we actually have?

It is meant to prevent roadmap confusion, especially around the difference between:
- a structured multi-agent harness
- a safe multi-agent harness
- a bounded semi-autonomous harness
- a truly operator-light daily workflow

## Short answer

### What does Phase F give us?
Phase F gives a real **team orchestration layer**:
- deterministic team activation
- stable task packets
- structured handoffs between roles

That means the harness starts to behave like a real **multi-agent system** rather than a collection of prompts and extensions.

However, **Phase F alone does not yet mean “almost hands-free programming.”**

### When does it become close to “almost hands-free”?
The roadmap implies this progression:
- **after Phase F:** structured multi-agent orchestration
- **after Phase G and H:** safer execution, isolation, validation, retry, and recovery
- **after Phase I:** bounded long-running autonomy becomes possible
- **after Phase J:** the system becomes much closer to an operator-friendly, almost hands-free workflow

So the most accurate answer is:
- **Phase F = multi-agent orchestration exists**
- **Phase I = bounded autonomy exists**
- **Phase J = bounded autonomy becomes practical to operate daily**

Current repo-local reality is still narrower than the full Phase I target, but HARNESS-034 now enforces the supported stop controls directly:
- bounded single-step queue advancement exists via `run_next_queue_job`
- supported queue-job controls enforced directly in `.pi/agent/extensions/queue-runner.ts` are `budget.maxRetries`, `budget.maxRuntimeMinutes`, `budget.maxFailedValidations`, and the approval boundary (`approvalRequired=true` / `approval_boundary_hit`)
- unsupported controls remain blocked explicitly, including `budget.maxCostUsd`, `budget.maxFilesChanged`, and unsupported free-form `stop_conditions`
- queue-runner decisions are logged to `logs/harness-actions.jsonl`

## Capability table by phase

| Phase | Name | Main capability gained | What you can realistically do after this phase | What you still do not have yet |
|---|---|---|---|---|
| A | Foundation hardening | Safe repo-local base and operating contract | Trust the repo structure, policy, and model mapping enough to build on it | No real multi-agent workflow yet |
| B | Prompt and role completion | Clear role boundaries and output contracts | Use multiple defined roles without total prompt chaos | No durable task semantics or runtime enforcement yet |
| C | State and schema | Deterministic task and queue semantics | Represent tasks, evidence, ownership, and queue intent in a stable form | No live guardrails or automation yet |
| D | Runtime extensions | Live safety and task-discipline controls | Block dangerous shell actions and require active-task discipline during work | No orchestration logic yet |
| E | Routing and model control | Deterministic model/provider routing | Route work and fallbacks systematically instead of ad hoc | No real team activation or handoff runtime yet |
| F | Team orchestration | Deterministic multi-role flow | Activate planning/build/quality/recovery teams, generate task packets, and perform structured handoffs | No worktree isolation, no completion-gate maturity, no queue-driven autonomy yet |
| G | Repo isolation | Parallel-safe execution boundaries | Run multiple workers more safely via worktrees/branch rules without stomping changes | Still not autonomous in a sustained way |
| H | Validation and recovery | Proof-based completion and controlled failure handling | Require validation before completion, classify failures, retry intelligently, and choose rollback when needed | No long-running queue execution yet |
| I | Long-running autonomy | Bounded queue-driven autonomy | Let the harness pull bounded jobs, execute them, stop on limits, and avoid endless drift | Daily operation is still rough without stronger operator controls |
| J | Operator usability and testing | Practical semi-autonomous operation | Start, inspect, pause, resume, and trust the system more like a tool than an experiment | Packaging/reuse is still incomplete |
| K | Packaging and docs | Reusability and transferability | Move the harness between repos and onboard others more cleanly | Capability does not fundamentally expand; it becomes easier to adopt |

## Phase-by-phase interpretation

### Phase A — Foundation hardening
This phase gives the harness a trustworthy base:
- verified Pi/runtime access
- canonical layout
- hardened `AGENTS.md`
- exact model mapping

Meaning:
- the project stops being aspirational and becomes structurally usable
- later automation can rely on a stable contract

But:
- it is still not a multi-agent harness in the practical sense yet

### Phase B — Prompt and role completion
This phase defines the workers, leads, and output formats more sharply.

Meaning:
- the harness can now express multi-role behavior clearly
- roles are less likely to overlap or improvise
- structured outputs make orchestration possible later

But:
- roles alone are not orchestration
- this is still mostly a better-controlled prompt architecture

### Phase C — State and schema
This phase gives tasks and queue concepts machine-readable meaning.

Meaning:
- ownership, evidence, task states, and queue semantics become explicit
- downstream runtime logic has something deterministic to enforce

But:
- schemas by themselves do not execute work
- there is still no actual long-running system behavior

### Phase D — Runtime extensions
This is where the harness starts enforcing rules at runtime.

Meaning:
- dangerous shell actions can be blocked
- mutation can require an active task
- completion can be tied to evidence rules

This is a major step because it reduces dependence on model obedience.

But:
- it is still primarily a guarded single-session harness slice
- team coordination is not yet the main story

### Phase E — Routing and model control
This phase makes model selection and provider fallback systematic.

Meaning:
- the harness can make more predictable decisions about which model should do what
- failures become more manageable

But:
- there is still no full team-orchestration runtime
- the harness is more disciplined, not yet more autonomous

### Phase F — Team orchestration
This is the first phase where it is fair to call the system a real **multi-agent harness**.

Expected gains:
- orchestrator decides which team to activate
- work is packaged into stable task packets
- handoffs become structured and reusable
- planning, build, quality, and recovery roles operate in a clearer loop

Meaning in plain language:
- you can stop manually improvising every role transition
- the harness starts to coordinate multiple role types coherently

But the important boundary is:
- **Phase F does not yet equal almost hands-free programming**

Why not?
Because Phase F still lacks several things needed for safe low-touch operation:
- worktree/repo isolation for parallel execution
- mature validation gates and recovery policy
- queue-driven job execution
- stop conditions for long-running work
- practical operator controls like pause/resume/inspect

So after Phase F, the most accurate label is:

> **structured multi-agent orchestration**

not:

> **operator-light autonomous programming**

### Phase G — Repo isolation
This phase matters because multi-agent systems become dangerous when workers share one mutable repo state carelessly.

Meaning:
- workers can operate in better-isolated worktrees or branches
- collisions and accidental overwrites become less likely

This does not create autonomy by itself, but it is a key prerequisite for trustworthy multi-worker execution.

### Phase H — Validation and recovery
This phase upgrades the harness from “can coordinate work” to “can judge and recover from work more reliably.”

Expected gains:
- validation tiers
- predictable validation checklist logic
- proof-based completion gates
- failure taxonomy
- retry logic
- rollback policy

Meaning:
- completion depends more on evidence than optimism
- the system can respond to failure in structured ways
- the quality loop becomes much more real

Current repo-local attachment in this slice:
- task-class-aware validation checklist logic and proof-based completion gates exist in `till-done.ts`
- docs/research tasks have lighter validation paths, while implementation/runtime-safety tasks require stronger proof
- manual override remains explicit and visible rather than silent

This is a major prerequisite for operator-light behavior.
Without it, “autonomy” would mostly mean faster mistakes.

### Phase I — Long-running autonomy
This is the first phase where the roadmap clearly supports the idea of **bounded autonomy**.

Expected gains:
- bounded queue execution
- scheduled workflows
- stop conditions

Meaning:
- the harness can pull one bounded job at a time
- jobs can run in sequence with explicit states
- failures, blockers, retries, and limits can be tracked
- long-running operation becomes possible without implying endless drift

Current repo-local attachment in this slice:
- bounded single-step queue advancement now exists via `run_next_queue_job` in `.pi/agent/extensions/queue-runner.ts`
- the tool finalizes one `running` job if its linked task is terminal, otherwise starts at most one eligible queued job
- supported HARNESS-034 controls are enforced directly: `budget.maxRetries`, `budget.maxRuntimeMinutes`, `budget.maxFailedValidations`, and the approval boundary (`approvalRequired=true` / `approval_boundary_hit`)
- file-backed scheduled workflow definitions now exist in `.pi/agent/schedules/scheduled-workflows.json` with explicit due-work inspection/materialization via `scripts/harness-scheduled-workflows.ts`
- scheduled workflows remain operator-driven and duplicate-safe rather than daemon-driven
- unsupported controls remain blocked explicitly rather than silently ignored
- queue-runner decisions are logged to `logs/harness-actions.jsonl`

This is the first phase where “almost hands-free” starts becoming a defensible phrase, but only in a bounded sense.

A careful description would be:

> The harness can perform bounded, queue-driven, semi-autonomous work one step at a time, with direct enforcement for max retries, runtime, failed validations, and approval-boundary stops while unsupported controls remain blocked.

That is much better than saying:

> The harness can just code on its own indefinitely.

### Phase J — Operator usability and testing
This phase makes the autonomy usable in practice.

Expected gains:
- explicit human control points
- daily operating workflow
- extension tests
- integration tests
- cost/performance tuning

Meaning:
- the operator knows when approval is still required
- pause/resume/inspection becomes part of the workflow
- trust improves because core flows are tested
- the system feels more like a controlled tool than a demo

This is the phase that most strongly supports the phrase:

> **almost hands-free for bounded jobs**

because by then you should have:
- orchestration
- repo isolation
- validation/recovery
- queue execution
- stop conditions
- operator controls
- test coverage for core flows

## Recommended terminology
To avoid overstating capability, use these labels:

### After Phase F
Use:
- **multi-agent harness with structured orchestration**
- **deterministic multi-role workflow**

Do not use:
- fully autonomous
- almost hands-free
- self-running coding system

### After Phase I
Use:
- **bounded semi-autonomous harness**
- **queue-driven multi-agent execution with stop conditions**

Use “almost hands-free” only with qualification, for example:
- **almost hands-free for bounded queued jobs under defined limits**

### After Phase J
Use:
- **operator-light multi-agent coding harness**
- **bounded autonomy with human control points**

This is the first point where “almost hands-free programming” becomes reasonably aligned with the roadmap, assuming the phase acceptance criteria are actually met in implementation.

## What “almost hands-free programming” should mean here
In this harness, that phrase should not mean:
- no human review ever
- no approvals for risky actions
- no need to inspect failures
- endless unsupervised repo mutation

It should mean something narrower and safer:
- you can queue bounded jobs
- the orchestrator routes them without constant manual prompting
- workers follow structured packets and handoffs
- validation gates block low-confidence completion
- failures trigger recovery logic instead of chaos
- stop conditions prevent drift
- the human mainly supervises, approves risky actions, and inspects outcomes

That is a strong and useful form of autonomy.
It is also much closer to what a real coding harness should aim for.

## Practical answer to the original question

### Q: What does this mean after Phase F?
After Phase F, you should have a **real multi-agent orchestration layer**, but not yet a fully practical operator-light autonomous system.

### Q: When do we get something close to almost hands-free programming?
The roadmap points to **Phase I + J** as the real answer:
- **Phase I** gives bounded long-running autonomy
- **Phase J** makes it operable and trustworthy enough for daily use

## Decision rule
If you need a one-line summary, use this:

- **Phase F:** multi-agent orchestration exists
- **Phase H:** proof-based recovery and completion gates exist
- **Phase I:** bounded autonomy exists
- **Phase J:** bounded autonomy becomes practical to operate
