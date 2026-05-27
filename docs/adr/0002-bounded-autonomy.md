# ADR-0002: Bounded autonomy — no daemons, no hidden schedulers, explicit step/runtime limits everywhere

- **Status:** Accepted
- **Date:** 2026-05-27
- **Supersedes:** none
- **Superseded-By:** none

## Context

The harness orchestrates multi-agent work that, in the abstract, lends
itself to long-running, mostly hands-off operation: a queue advances,
workers execute, validators report, PRs open and merge. A naive
implementation would be a background daemon polling state forever.

That has been an explicit non-goal from the beginning. The repo's
top-level docs and operator guides repeatedly emphasize that the
harness is an **operator-assisted system**, not a hands-free autonomous
engineer:

- `AGENTS.md` enforces task-discipline, evidence, and approval rules
  that assume a human is in the loop on every meaningful transition.
- The README's "Current status" section names what the harness does
  ("first live runtime controls", "bounded validation workflow") and
  explicitly says it does NOT yet include "a free-running queue daemon
  or hidden scheduled workflow loop".
- The queue runner (`.pi/agent/extensions/queue-runner.ts`) advances
  the queue one bounded step at a time through `run_next_queue_job`
  and `run_bounded_queue_session`. The latter requires explicit
  `maxSteps` and `maxRuntimeSeconds`, refuses unsupported control
  knobs like `maxCostUsd` or free-form `stop_conditions`, and stops
  visibly at the next waiting point.
- The scheduled-workflow helper (`scripts/harness-scheduled-workflows.ts`)
  is operator-driven: due workflows are inspected and materialized by
  explicit commands, never picked up automatically.
- AFK orchestration (`harness:afk-orchestrate`), worker execution
  (`harness:worker-execute`), and PR lifecycle (`harness:pr-lifecycle`)
  all require explicit `--run`, `--max-steps`, `--max-runtime-seconds`,
  `--max-parallel`, and stop boundaries (`--stop-before-pr`,
  `--stop-before-merge`). Merges require explicit
  `--allow-merge --approval-ref`.

Multiple historical reviews have called out that this stance is the
harness's defining property. It informs how doctor reports state, how
the queue runner refuses unknown control knobs, and how every operator
helper's "non-goals" section reads. The reasoning is, briefly:

- Long-running, unattended autonomous coding has unsafe failure modes
  (silent context drift, runaway cost, unobservable retry loops) that
  this team has explicitly chosen not to take on.
- The harness is intended to be operator-light, not operator-absent.
  Validation, evidence, and approval gates assume a human can be
  reached for every load-bearing transition.
- Bounded foreground execution composes naturally with `AGENTS.md`'s
  task-discipline rules: every mutation is linked to an active task,
  every transition is visible in the audit log, and stop conditions
  show up in the run summary.

The decision has been operationally clear but had no single
authoritative source. AGENTS.md implied it through individual rules;
README implied it through what it said the harness "does not yet"
support. There has been no central place to point at when a future
contributor proposes a daemon mode or a "just let it run" flag.

## Decision

The harness operates under **bounded autonomy**. Specifically:

1. **No daemons.** No process inside the harness runs continuously in
   the background. There is no `harness:daemon`, no long-lived watcher,
   no `--watch` flag on any harness command. The Graphify CLI's
   `--watch` is explicitly forbidden in our adapter.
2. **No hidden schedulers.** Scheduled workflows are inspected and
   materialized by explicit operator commands. Cron-like behavior, if
   needed, must be supplied externally (host cron, GitHub Actions
   schedule, a `/loop` invocation from Claude Code) and operate over
   the same bounded CLIs as any other operator action.
3. **Explicit step and runtime limits everywhere.** Every multi-step
   harness operation requires explicit limits at the call site:
   - Queue advancement: `--max-steps` and `--max-runtime-seconds`.
   - AFK orchestration: `--run`, `--max-steps`, and
     `--max-runtime-seconds` are required for run mode;
     `--max-parallel` is optional (defaults narrowly).
   - Worker execution: `--max-steps`, `--max-runtime-seconds`, and a
     stop boundary that defaults to `--stop-before-pr`.
   - PR lifecycle: default `--stop-before-merge`; merge needs
     `--allow-merge --approval-ref`.
4. **Unsupported control knobs are rejected, not silently ignored.**
   Limits the harness does not yet enforce (`maxCostUsd`,
   free-form `stop_conditions`) must be rejected with a visible
   blocker rather than accepted-and-discarded. Today this is
   implemented by the queue runner refusing to start a job that
   carries such fields (a blocked-before-start state with an
   explanatory note); a tighter parse-time rejection is allowed and
   preferred but not required by this ADR. Silent acceptance of
   unsupported knobs has caused incidents in the past and is
   forbidden in any form.
5. **Stop conditions are visible, not opportunistic.** When a bounded
   run hits its limit or a blocker, it stops and reports state
   (`waiting_for_human`, `blocked`, `idle`, etc.). It does not retry
   forever, does not silently extend itself, and does not exit `0`
   with a vague "done" message.
6. **Approval gates are explicit references, not flags.** Anywhere a
   gated transition can occur (PR merge, allow-PR-create on a worker
   run, screen approval, etc.), the gate requires an
   `--approval-ref <ref>` value that is recorded in the resulting
   artifact. Bare `--allow-*` flags are not sufficient on their own.

### What this decision explicitly does NOT cover

- Whether to add a **separate** bounded-autonomy mode (e.g., a future
  "lights-out" mode under an explicit feature flag with its own
  approval flow). If the team ever wants this, it requires a new ADR
  that argues against this one or carves out a clearly-scoped
  exception. Doing it implicitly by adding a daemon and calling it
  something else is forbidden by this ADR.
- The cadence and shape of **external** schedulers (host cron,
  GitHub Actions, the `/loop` skill in Claude Code, etc.). Those are
  free to call into the harness on any cadence the operator wants, as
  long as each invocation goes through the standard bounded CLIs.
- The internal implementation of how a single bounded step is
  executed. Step semantics, retry policy, validation gating, recovery,
  and so on each have their own decision points and will get their
  own ADRs as those decisions firm up.

## Consequences

Positive:

- One authoritative place to point at when a future contributor
  proposes a "just let it run" mode. The answer is: open a new ADR,
  argue against this one, and accept the review burden.
- Every harness operation has a predictable, bounded shape. Operators
  can size cost, time, and risk per invocation.
- The audit log and bounded session summaries reflect exactly what
  happened, because work happens in foreground, traceable steps.
- Safety rules in `AGENTS.md` and approval gates in operator helpers
  compose cleanly with the absence of background execution.

Negative:

- Day-to-day operation is more hands-on than a daemon would be. An
  operator must explicitly run each bounded step or wire an external
  scheduler. This is accepted cost.
- Long-running flows (multi-hour pipelines) need either multiple
  invocations or a deliberate `--max-runtime-seconds` budget. There is
  no "just leave it overnight" mode in the harness itself.
- Adding new harness operations requires designing their stop
  conditions and limits up front. This is real engineering work that a
  daemon-based system would defer (or never do).

## Notes

- Top-level rules that this ADR derives from:
  `AGENTS.md` (Core operating rules, Task discipline rules, Validation
  rules, Safety rules) and README "Current status" / "Roadmap status"
  sections.
- Implementation references:
  `.pi/agent/extensions/queue-runner.ts` (bounded queue session),
  `scripts/harness-scheduled-workflows.ts` (operator-driven schedules),
  `scripts/harness-afk-orchestrate.ts`,
  `scripts/harness-worker-execute.ts`,
  `scripts/harness-pr-lifecycle.ts`.
- The `/loop` skill in Claude Code is an example of an external,
  operator-driven scheduler that satisfies the rules of this ADR
  rather than violating them: each `/loop` tick is a separate,
  bounded harness invocation.
