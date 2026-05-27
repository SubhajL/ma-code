# Coding Log — Architecture Decision Records (ADR) index

## Goal

Establish a lightweight markdown convention for recording load-bearing
architectural decisions, so that future source-of-truth drift (like the
AGENTS.md vs `tier-1-status.md` disagreement that PRs #222/#223 just
closed) gets resolved against a single authoritative place. No tool, no
codegen — just a markdown standard plus a single-purpose static check.

## Approach

Direct implementation, six files. No TS code, no unit tests in the
traditional sense; the verification surface is `check-repo-static.sh`.

### New convention surface

- `docs/adr/README.md` — explains the convention: numbered files
  (`NNNN-<kebab-slug>.md`), required sections (`Status`, `Date`,
  `Context`, `Decision`, `Consequences`, `Supersedes`,
  `Superseded-By`), lifecycle (Proposed → Accepted → Superseded /
  Deprecated), authority rule, what this directory is NOT.
- `docs/adr/TEMPLATE.md` — authors copy this to start a new ADR.
- `docs/adr/0001-runtime-state-is-sqlite.md` — backfills the SQLite
  migration decision (the `pi.db` move catalogued in
  `docs/initiatives/harness-cleanup/tier-1-status.md`, finalized by
  PR #223's drift fix).
- `docs/adr/0002-bounded-autonomy.md` — backfills the "no daemons, no
  hidden schedulers, explicit step/runtime limits" stance the harness
  has had from day one.

### Authority wiring

- `AGENTS.md` adds an "Architecture decisions" section near the bottom
  pointing at `docs/adr/README.md`, with the rule: **when AGENTS.md and
  an ADR disagree, the ADR wins for the area it covers.**
- `README.md` adds a "Related docs" cross-link to the ADR index,
  labeled as "load-bearing decisions, authoritative when in conflict
  with prose docs".

### Drift guard

`scripts/check-repo-static.sh` extended with:

- Four new entries in `required_files` (index, template, ADR-0001,
  ADR-0002).
- Python assertions that:
  - the ADR index contains "ADR-0001";
  - `AGENTS.md` and `README.md` both contain the substring
    `docs/adr/README.md`;
  - every `NNNN-*.md` file under `docs/adr/` is mentioned in the index
    table by its `ADR-NNNN` label (file-vs-index symmetry);
  - every ADR's `Status:` value is one of
    `{Proposed, Accepted, Superseded, Deprecated}`.

This catches the obvious drift modes — adding an ADR file without
indexing it, deleting an indexed file, or using a free-form Status.

## QCHECK findings addressed

Ran `/code-review` (medium effort) on the working tree. Top findings
were factual mismatches with code or with the rest of the repo:

1. **HIGH — ADR-0002 said unsupported control knobs "must error at
   parse time"** — the actual queue runner blocks them at runtime
   (`blocked-before-start` state with explanatory note), not at parse
   time. Rewrote the wording so the binding part is "rejected with a
   visible blocker" and noted that tighter parse-time rejection is
   allowed but not required by the ADR.

2. **HIGH — `task_update` tool description still said "file-backed
   JSON state"** in `.pi/agent/extensions/till-done.ts:1017`,
   contradicting ADR-0001 on day one (and the SQLite-cleanup PR #223
   that the ADR was supposed to lock in). Updated to point at the
   canonical SQLite store.

3. **HIGH — ADR-0002 listed `--max-parallel` as a required limit for
   AFK orchestration** — it's optional in
   `scripts/harness-afk-orchestrate.ts`. Corrected to "required:
   `--run`, `--max-steps`, `--max-runtime-seconds`; optional:
   `--max-parallel`".

4. **MEDIUM — `docs/adr/README.md` self-described as "no validator
   beyond a single static-check assertion"** while three assertions
   already existed. Rewrote the section to describe the actual
   coverage (file presence, index symmetry, Status allowlist, cross-link
   checks) without overpromising.

5. **MEDIUM — Static check was too weak for the convention's own
   anti-drift goal.** Strengthened as described above: file-vs-index
   symmetry check + Status allowlist check.

6. **MEDIUM — ADR-0001 cited `AGENTS.md:77-80` by line number** —
   fragile. Replaced line-pinned references with named-section quotes
   (e.g., 'AGENTS.md "Task architecture note" said ...').

7. **MEDIUM — ADR-0001 elevated implementation details (DELETE/INSERT
   write pattern, read-write + `PRAGMA query_only = ON` handle mode)
   to binding ADR-level decisions** — a routine future refactor would
   need a superseding ADR for what is really a runbook-level change.
   Reworded so those are stated as current implementation choices that
   may evolve without a new ADR; the binding part is "DB is opened in
   WAL mode with FK on" and "doctor probes without writing".

8. **LOW-MEDIUM — ADR-0002 anchored its "why" to a single dated
   coding-log file** — that file might be archived / renamed, and the
   ADR README itself says logs should reference ADRs, not the reverse.
   Restated the rationale in-line so the ADR stands on its own.

## Out-of-scope items NOT addressed

- ADR-vs-AGENTS.md cross-link asymmetry (AGENTS.md links to the index
  with markdown, the index back-references AGENTS.md as plain text).
  Cosmetic; deferred.
- A full Supersedes/Superseded-By symmetry check in
  `check-repo-static.sh`. Not implemented yet — punted to "when there
  is an actual supersession to enforce against".
- Any other doc that may still contradict ADR-0001/ADR-0002 beyond the
  `till-done.ts` description fixed above. Will be flagged by future
  reviews against the ADR.

## Files changed

- `docs/adr/README.md` — new (the convention)
- `docs/adr/TEMPLATE.md` — new
- `docs/adr/0001-runtime-state-is-sqlite.md` — new (backfill)
- `docs/adr/0002-bounded-autonomy.md` — new (backfill)
- `AGENTS.md` — added "Architecture decisions" section pointing at the
  index with the override rule
- `README.md` — added cross-link to ADR index in "Related docs"
- `scripts/check-repo-static.sh` — four new `required_files` entries +
  Python assertions for index symmetry, Status allowlist, and the
  AGENTS.md/README.md cross-links
- `.pi/agent/extensions/till-done.ts` — `task_update` tool description
  updated from "file-backed JSON state" to "Persists to the canonical
  SQLite runtime store at .pi/agent/state/runtime/pi.db"

## Evidence

- `npm run typecheck` → clean (baseline 0; the till-done.ts edit is a
  string-literal change, no type impact).
- `bash scripts/check-repo-static.sh` → `repo-static-checks-ok`
  (PASS); confirms ADR index, template, and the two backfilled ADRs
  are all wired and that the AGENTS.md/README.md cross-links exist.
- Manual grep: `docs/adr/README.md` appears in both `AGENTS.md` and
  `README.md` ✓.
- Manual grep: `ADR-0001` and `ADR-0002` both appear in
  `docs/adr/README.md` index table ✓.

## Wiring verification

This PR adds no exports — it adds markdown files, doc cross-links, and
one tool-description string update. The relevant wiring is bidirectional
references rather than imports:

| Reference direction | Source | Target | Verified |
|---|---|---|---|
| AGENTS.md → ADR index | `AGENTS.md` "Architecture decisions" section | `docs/adr/README.md` | grep + check-repo-static.sh |
| README.md → ADR index | "Related docs" bullet | `docs/adr/README.md` | grep + check-repo-static.sh |
| ADR index → AGENTS.md | "Authority" section | `AGENTS.md` (named section, not anchor) | manual |
| Index table → ADR files | Index table rows | `docs/adr/000N-*.md` | check-repo-static.sh symmetry assertion |

## Unresolved risks / known gaps

- Backfilled ADRs make claims that need to remain true as the codebase
  evolves. The QCHECK fixes above softened most pin points, but
  ADR-0001 still names specific SQLite table names (`tasks`,
  `active_task`, `queue_jobs`, `queue_meta`, `leases`, `audit_log`).
  Renaming any of those tables in the future requires a superseding
  ADR — appropriate, since table names are part of the public schema.
- No GitHub Actions / CI assertion that PRs touching `docs/adr/` go
  through extra review. Defer to repo-level convention.
- `pi_multi_agent_build_plan_layman_REPO_LOCAL.md:970-972` still says
  JSON is the persistence layer (called out in PR #223's coding log as
  out-of-scope historical doc). Not in scope for the ADR PR either.
