# Architecture Decision Records (ADRs)

This directory holds the harness's **architecture decision records** — the
single, authoritative current source of truth for load-bearing decisions
about how the system is built.

It exists because phase-history docs (e.g., `docs/initiatives/harness-cleanup/`),
top-level rules (`AGENTS.md`), and the operator-facing README accumulate
language that can drift out of sync. When `AGENTS.md` says one thing and a
phase tracker says another (as happened with the SQLite-vs-JSON canonical
question), there has been no single place that wins. ADRs are that place.

## What an ADR is

An ADR is a short, dated, numbered markdown file that records one decision:
the context that forced it, the choice made, and the consequences.

ADRs are **not** specs, plans, or runbooks. They do not describe how to use a
feature; they describe why the team decided to build it the way they did.
Phase trackers, operator docs, and runbooks should reference the relevant
ADR when their content depends on a decision recorded here.

## Authority

When this directory and any other doc in the repo disagree about a decision
covered by an ADR, **the ADR wins for the area it covers**. The other doc
should be updated to match. The complementary rule lives at the bottom of
`AGENTS.md` ("Architecture decisions" section).

If an ADR turns out to be wrong, do not silently rewrite it. Write a new
ADR that supersedes it and update the old one's status. The history is
load-bearing.

## File naming

```
docs/adr/<NNNN>-<short-kebab-slug>.md
```

- `NNNN` is a four-digit zero-padded sequence number, never reused.
- `<short-kebab-slug>` is a 3–6 word kebab-case summary (e.g., `runtime-state-is-sqlite`).
- The next ADR number is `(max existing) + 1`. Check this directory before
  picking a number.

The index file (this `README.md`) lists every ADR. Update the table below
when you add an ADR.

## Required sections

Each ADR must include:

- **Title** — `ADR-NNNN: <short statement of the decision>`
- **Status** — `Proposed`, `Accepted`, `Superseded`, or `Deprecated`.
  Use one of these exact words.
- **Date** — ISO date when the status was last updated (`YYYY-MM-DD`).
- **Context** — What was happening before the decision? What forced it?
  Include enough background that someone reading this in a year can
  understand without re-deriving the history.
- **Decision** — The choice, stated in declarative present tense.
  Be specific about scope: what does this decision cover, and what does
  it explicitly NOT cover?
- **Consequences** — Real downstream effects (positive and negative).
  Include constraints on future work that fall out of this decision.
- **Supersedes / Superseded-By** — One line each, with the ADR number
  (e.g., `Supersedes: none` / `Superseded-By: none`). Use `none` literally
  when there is no relationship.

The template at [`TEMPLATE.md`](./TEMPLATE.md) captures this skeleton.

## Lifecycle

1. **Drafting.** Copy `TEMPLATE.md` to `NNNN-your-slug.md`, fill in the
   sections, set Status to `Proposed`, set Date to today.
2. **Acceptance.** When the decision is approved (PR review, sync meeting,
   whatever channel the team uses), flip Status to `Accepted` and update Date.
3. **Updating top-level docs.** When you accept an ADR, immediately update
   any contradicting language in `AGENTS.md`, README, or other docs to point
   at the ADR. The ADR is authoritative; existing prose must yield.
4. **Superseding.** If a later decision overrides this one, write a new ADR.
   In the new ADR's `Supersedes` line, list the old ADR's number. Then go
   back to the old ADR, flip its Status to `Superseded`, update its Date,
   and set `Superseded-By` to the new ADR's number.
5. **Deprecating.** If a decision becomes irrelevant (e.g., the subsystem
   was removed), flip Status to `Deprecated` and add a one-paragraph note
   at the end explaining why. Do not delete the file.

## Index

| ADR | Title | Status | Date |
|---|---|---|---|
| [ADR-0001](./0001-runtime-state-is-sqlite.md) | Runtime state is SQLite at `.pi/agent/state/runtime/pi.db`, not JSON | Accepted | 2026-05-27 |
| [ADR-0002](./0002-bounded-autonomy.md) | Bounded autonomy: no daemons, no hidden schedulers, explicit step/runtime limits | Accepted | 2026-05-27 |
| [ADR-0003](./0003-atomic-queue-task-mutations.md) | Coupled queue + tasks mutations go through one SQLite transaction | Accepted | 2026-05-27 |
| [ADR-0004](./0004-apps-web-and-services-api-are-harness-fixtures.md) | `apps/web/` and `services/api/` are harness pilot fixtures, not a product foundation | Accepted | 2026-05-27 |

## What this directory is NOT

- Not a tool. There is no codegen and no CLI. The only enforcement is a
  small set of static-check assertions in `scripts/check-repo-static.sh`:
  the index file and each `NNNN-*.md` ADR file must exist; every ADR file
  under this directory must appear as a row in the index table above;
  every ADR's `Status:` value must be one of the four allowed words; and
  `AGENTS.md` / the operator README must cross-link this index. ADRs are
  otherwise read by humans and agents the same way they read AGENTS.md.
- Not a substitute for phase trackers in `docs/initiatives/`. Initiative
  docs describe the *work*; ADRs describe the *decisions* that work
  embodied.
- Not a substitute for the operator manual or runbooks. Those describe
  *how to operate* the system as it exists today. ADRs describe *why* it
  exists in that shape.
- Not a private design diary. Each ADR is a public, dated record. Write it
  as if a new engineer will read it after the original authors have moved
  on — because that is usually who reads it.
