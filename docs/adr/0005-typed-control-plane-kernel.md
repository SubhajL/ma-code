# ADR-0005: New control-plane mutations go through a typed kernel

- **Status:** Accepted
- **Date:** 2026-05-27
- **Supersedes:** none
- **Superseded-By:** none

## Context

[ADR-0001](./0001-runtime-state-is-sqlite.md) anchored the canonical
runtime store to SQLite at `.pi/agent/state/runtime/pi.db`.
[ADR-0002](./0002-bounded-autonomy.md) made bounded autonomy a
first-class invariant of every operator surface.
[ADR-0003](./0003-atomic-queue-task-mutations.md) gave coupled
queue/task changes a single-transaction helper. Together those ADRs
say *what the control plane is built on*. They do not say what shape
new control-plane code should present at its callsites.

In practice each existing control-plane operation parses its argv
inline, runs ad-hoc work, prints output for human operators, and
returns a process exit code. The central dispatch table
(`scripts/lib/harness-dispatch.ts`, landed across PRs #185/#187/#193/#194)
unified subcommand discovery and removed the npm-shell-out cost, but
its public surface is still `(argv: string[]) => Promise<number>` —
strings in, exit code out. There is no typed input shape, no typed
result envelope, and no canonical audit emission. Each new operation
re-invents the same three things:

- input validation (and the failure mode when validation rejects);
- result reporting (success payload vs. blocked-with-reason vs. crashed);
- audit-log emission shape.

The 2026-05-27 system review framed this as the next step after the
SQLite + atomicity foundation (see the senior-engineer prioritization
recorded in
`coding-logs/2026-05-26-09-26-58 Coding Log (weekly-summary-2026-05-19_to_2026-05-26).md`,
referenced from ADR-0003 and ADR-0004). Locking in a single typed
contract lets later work (a real domain store; a validator-report
schema; broader call-site migrations) compose against the same shape
rather than reinventing it per surface.

This ADR records the shape of that contract. It does NOT migrate any
existing callsite — that work is opportunistic follow-up.

## Decision

A new module at
[`.pi/agent/extensions/lib/control-plane.ts`](../../.pi/agent/extensions/lib/control-plane.ts)
defines the typed control-plane kernel. New control-plane mutations
SHOULD adopt it; existing ones MAY migrate when touched for other
reasons. The contract has three load-bearing pieces:

### 1. Typed command spec

Every control-plane operation is declared as a
`ControlPlaneCommandSpec<Name, Input, Value>`:

```ts
interface ControlPlaneCommandSpec<TName, TInput, TValue> {
  readonly name: TName;
  parseInput(raw: unknown): { input: TInput } | { error: string };
  run(input: TInput, ctx: ControlPlaneContext): Promise<TValue>;
}
```

- `name` is a literal-typed string used in the audit-log action.
- `parseInput` is the only sanctioned validation surface. It returns
  a structured `{ error }` on rejection — no `throw`. This keeps the
  parse → blocked path observable and avoids accidental stack traces
  in operator output.
- `run` receives the validated input plus a
  `ControlPlaneContext { cwd, kernelCommand, emitAudit }`. The body
  is normal async TypeScript: return a value to succeed, throw
  `ControlPlaneBlockedError(reason, details)` to surface a typed
  blocked state, throw anything else to surface a typed failure.

### 2. Discriminated-union result envelope

`runControlPlaneCommand(spec, raw, { cwd })` returns
`ControlPlaneResult<Name, Value>`, a discriminated union on
`status`:

- `{ status: "ok", command, value, auditError? }` — successful
  resolution.
- `{ status: "blocked", command, reason, details?, auditError? }` —
  either `parseInput` rejected the input or `run` threw
  `ControlPlaneBlockedError`. Blocked is NOT an error condition; it
  is a typed operator-visible state matching the bounded-autonomy
  vocabulary from ADR-0002.
- `{ status: "failed", command, error: { code, message }, auditError? }`
  — `run` threw anything other than `ControlPlaneBlockedError`. The
  `code` carries the original error name (e.g., `TypeError`),
  unobtrusively classifying the failure.

The `auditError` field is set ONLY when the kernel's own audit-log
emission threw. The original `status` and payload remain intact so
audit-emission failures cannot mask the underlying result. Audit
emission for parse-stage rejections is intentionally skipped: parse
failures are caller-side bugs, not control-plane events, and
recording them would inflate the audit log without telling the
operator anything actionable.

**Parse-blocked vs. runtime-blocked discrimination.** Parse rejections
always surface with `reason: "invalid_input:<detail>"`. Runtime
blocks (a `ControlPlaneBlockedError` thrown by `run`) carry the
caller-chosen reason verbatim. Consumers that need to distinguish a
caller-side input bug from a legitimate operator-visible stop can
match the `"invalid_input:"` prefix. The convention is binding.

**Caller emissions are NOT covered by `auditError`.** The asymmetry
matters: if a command body calls `ctx.emitAudit(...)` and that
emission throws, the exception propagates out of `run` and the
kernel converts it to a `ControlPlaneFailed` result. The kernel only
guards its own terminal `:ok` / `:blocked` / `:failed` emission via
`auditError`. Callers that want non-fatal intermediate audits must
wrap their `ctx.emitAudit` call in their own try/catch.

### 3. Canonical audit emission

Every successful or post-validation outcome emits exactly one final
audit entry through `appendAuditEntry` (so it lands in both the
SQLite `audit_log` table and the JSONL mirror) with:

- `extension: "control-plane"` (the constant
  `CONTROL_PLANE_AUDIT_EXTENSION`),
- `action: "<name>:ok" | "<name>:blocked" | "<name>:failed"`,
- structured payload fields (`reason`, `details`, `errorCode`,
  `errorMessage`) depending on outcome.

The context's `emitAudit` helper lets command bodies record
intermediate events (e.g., progress markers, partial-state
acknowledgements) without re-deriving the kernel's emission shape.

### What this decision explicitly does NOT cover

- **Existing call sites.** This ADR adds a new surface; it does not
  migrate `harness-operator-status.ts`, `harness-operator-leases.ts`,
  `harness-queue-session.ts`, or any other in-process subcommand.
  Migrating them is opportunistic follow-up; each migration is a
  small focused PR that can be reviewed on its own.
- **`runHarnessCommand` argv dispatch.** The
  `scripts/lib/harness-runner.ts` `(argv) => Promise<number>` surface
  remains the operator CLI entry point. New typed commands can be
  exposed there via thin argv-to-Input adapters; the dispatch table
  itself does not change shape in this PR.
- **A validator-report schema.** Validators currently emit ad-hoc
  `{ status, failedChecks, checks }` JSON inside 19+ bash scripts
  (catalogued in PR #221 / Tier 3 §10 scope-check). Defining a
  typed validator-report contract is a designated follow-up; it
  belongs in its own PR alongside the first migrated validator. The
  control-plane kernel deliberately stops at the operator-command
  boundary so the two contracts can be designed against real call
  sites rather than guessed at simultaneously.
- **Promoting SQLite to a real domain store** (migrations table,
  foreign keys across entities, typed row ops). ADR-0001 already
  defers that. The kernel's stable shape is what enables the later
  domain-store work to express constraints at the right boundary,
  but it does not pre-decide where those constraints live.
- **Constraining the `reason` string to a typed vocabulary.**
  `ControlPlaneBlockedError(reason, details?)` accepts any string.
  ADR-0002 defines a small vocabulary for operator-visible blocked
  states (`waiting_for_human`, `blocked`, `idle`, etc.), but lifting
  that into a typed `BlockedReason` union here would force-decide
  the cross-extension vocabulary before any kernel-driven command
  exists to validate the choice. Designated follow-up: once two or
  three kernel commands have shipped, narrow `reason` to a
  discriminated union aligned with ADR-0002's blocked states.
- **Audit emission inside caller-supplied transactions.** The
  kernel calls `appendAuditEntry` on its own `RuntimeDb` connection
  AFTER `run` resolves. A command body that uses
  `withAtomicQueueAndTasksMutation` (ADR-0003) commits the
  queue/task changes first; the kernel's terminal audit emission
  then runs in a separate transaction. This matches today's
  `appendAuditEntry` semantics elsewhere in the harness — audit
  durability is best-effort post-mutation, and incomplete audit on
  a crash is acceptable because the JSONL mirror provides a second
  durability path. Folding terminal audit into the coordinated
  transaction is a separate decision that would touch ADR-0003 and
  is explicitly out of scope here.

## Consequences

Positive:

- New control-plane code has one obvious shape to adopt. Reviewers
  can ask "why isn't this a `ControlPlaneCommandSpec`?" for new
  mutations without needing per-PR taste discussion.
- The blocked / failed distinction is captured in types instead of
  string conventions, matching the bounded-autonomy invariants from
  ADR-0002 (operator-visible stops vs. unexpected crashes).
- Audit emission is centralised. The eight built-in `appendAuditEntry`
  callsites today each re-state the entry shape; new kernel-driven
  code inherits a canonical envelope.
- The `auditError` field lets failures in the audit pipeline surface
  to operators without losing the primary result — a regression the
  existing `appendAuditEntry` callers would silently fail on.

Negative:

- Two ways to write control-plane code now coexist: the legacy
  argv-based runners and the new kernel-based commands. Reviewers
  must judge whether new code belongs in the kernel; the rule above
  ("new mutations SHOULD adopt it") is advisory, not enforced.
- The `auditError` field on every result variant is a small wart on
  the otherwise clean discriminated union. It is preferable to the
  alternatives (silent log loss, throwing through the result) but it
  is an extra optional field every consumer must remember exists.
- `parseInput` returning `{ error }` rather than throwing differs
  from the surrounding Node convention. The rule is intentional (see
  the parse-failure-no-audit reasoning above) but is one more thing
  to teach.

## Notes

- Kernel module: [`.pi/agent/extensions/lib/control-plane.ts`](../../.pi/agent/extensions/lib/control-plane.ts).
- Tests: `tests/extension-units/control-plane.test.ts` (8 tests
  covering ok / parse-blocked / runtime-blocked / failed paths,
  audit emission, audit-error isolation, context propagation, and
  the discriminator narrowing).
- Known follow-up: `scripts/validate-extension-unit-tests.sh` has a
  hardcoded check list and does not auto-discover the new
  `control-plane.test.ts`. Same gap noted for `doctor.test.ts`,
  `harness-package.test.ts`, and `coordinated-state.test.ts` in
  their respective coding logs. Adding the wiring is a separate
  validator-wiring PR.
- Audit emission flows through
  [`appendAuditEntry`](../../.pi/agent/extensions/lib/audit-log.ts)
  with `extension: "control-plane"` and
  `action: "<name>:(ok|blocked|failed)"`.
- Related: [ADR-0001](./0001-runtime-state-is-sqlite.md) (state),
  [ADR-0002](./0002-bounded-autonomy.md) (blocked vs. failed
  vocabulary), [ADR-0003](./0003-atomic-queue-task-mutations.md)
  (atomicity invariant any future kernel-wrapped coupled mutation
  must inherit).
