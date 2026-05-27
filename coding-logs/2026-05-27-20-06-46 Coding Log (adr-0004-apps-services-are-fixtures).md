# Coding Log — ADR-0004: apps/web + services/api are harness pilot fixtures

## Goal

Resolve the recurring "is `apps/web` / `services/api` part of a real
product?" drift identified by the 2026-05-27 system review as MEDIUM
("Product scaffold is mostly a fixture/contract artifact, not a
runnable app"). This is recommendation #4 from the senior-engineer
review prioritization — explicitly a product/ownership decision, not
engineering. The code already answers the question (placeholder
server-entry object, string-returning App, intentionally-unimplemented
OpenAPI), so the work here is to label and document the answer in one
authoritative place.

## Decision (recorded in ADR-0004)

`apps/web/` and `services/api/` are **harness pilot fixtures**, not a
product foundation. They exist so the harness's product-pipeline flow
(intake → screen → contract → FE/BE packets → worker execution) has
something concrete to operate against. If real product work begins
later, that requires a superseding ADR.

## Approach

Direct implementation, pure-docs work. No TS code changes, no unit
tests; the verification surface is `scripts/check-repo-static.sh`.

### New files

- `docs/adr/0004-apps-web-and-services-api-are-harness-fixtures.md` —
  the binding decision. Cites the system review's concrete evidence
  (server-entry object, string-returning App, Phase A OpenAPI with
  `issue-008`/`issue-012` unimplemented dependencies). Records the
  lifecycle escape hatch (write a superseding ADR; decide layout,
  runtime, deploy, fate of fixtures).
- `apps/web/README.md` — opens with a `HARNESS PILOT FIXTURE — NOT A
  RUNNABLE PRODUCT` banner, links to ADR-0004, summarizes what the
  dir is and is not. Specifically clarifies that `main.tsx` writes
  via `document.body.innerHTML` and is NOT driven by `react-dom`.
- `services/api/README.md` — symmetric banner + summary. Specifically
  says `server.ts` does not bind a port, and `openapi.ts` is a
  fixture artifact, not a published API contract.

### Existing files modified (QCHECK-driven)

- `docs/adr/README.md` — index updated with ADR-0004 row.
- `docs/initiatives/greenfield-scaffold/README.md` — added a top
  banner pointing at ADR-0004; updated "Current scaffold surface"
  bullets to mark the dirs as fixtures with inline ADR links.
- `docs/initiatives/greenfield-scaffold/foundation-contract.md` —
  same banner + bullet annotations. The "Future slices may add..."
  language now reads "ONLY after a superseding ADR is accepted".
- `scripts/check-repo-static.sh`:
  - `required_files` adds 4 entries (the new ADR + both fixture
    READMEs).
  - New Python assertions enforce both READMEs carry the literal
    banner phrase `HARNESS PILOT FIXTURE` (not just any "fixture"
    substring) AND link to the ADR filename. Also asserts both
    greenfield-scaffold docs mention "harness pilot fixture" and
    link to the ADR.

## QCHECK findings addressed

Ran `/code-review` on the working tree. Top findings were:

1. **HIGH — `docs/initiatives/greenfield-scaffold/foundation-contract.md`
   directly contradicted ADR-0004** ("Frontend shell exists under
   apps/web with a placeholder landing route... Future slices may add
   UI structure..."). The root README links to this initiative
   overview, so a contributor entering via that path would never see
   the fixture banner. Per `docs/adr/README.md` lifecycle step 3,
   contradicting docs MUST be updated to point at the ADR. Fixed by
   adding a top banner + per-bullet ADR links + scoping the "future
   slices may add..." language behind a superseding ADR.

2. **HIGH — `docs/initiatives/greenfield-scaffold/README.md` described
   the dirs as "Current scaffold surface"** with no mention of fixtures
   and no link to ADR-0004. Same fix as above.

3. **HIGH — ADR-0004 itself was silent about the greenfield-scaffold
   docs.** Fixed by the cross-link updates above; the static-check
   assertions in `check-repo-static.sh` now enforce both initiative
   docs reference ADR-0004 so this drift cannot reopen silently.

4. **MEDIUM — static check used substring `"fixture"` (case-insensitive)**
   which would match unrelated mentions like "test fixtures elsewhere".
   Tightened to require the literal banner `HARNESS PILOT FIXTURE` in
   both READMEs, plus the ADR filename as the link target (filename
   rather than full path so relative links like `../../adr/...` still
   satisfy the check).

5. **LOW — README claimed "no React runtime mounted in this repo"** —
   technically true (no `react-dom`) but a casual reader might
   conclude nothing mounts; in fact `main.tsx` writes via
   `document.body.innerHTML` on module load when document is present.
   Tightened the apps/web/README wording to call this out explicitly.

## Evidence verified positively (by QCHECK reviewer)

- `services/api/src/server.ts:1-13` — exact match with the ADR's
  "server-entry object, not an HTTP server" claim.
- `apps/web/src/App.tsx:22-33` — returns HTML strings, not JSX.
- `services/api/src/contracts/openapi.ts` — Phase A artifact with
  `workerImplementationDependencies` entries for `issue-008` (auth)
  and `issue-012` (FE client); only `/health` route is implemented.
- No `ReactDOM`/`createRoot`/`.listen(`/`http.createServer`/`Express`/
  `Fastify`/`Hono` references anywhere in `apps/web/` or
  `services/api/` — confirmed by repo-wide grep.
- No references to these directories in `.github/workflows/` or
  `.pi/agent/package/harness-package.json` — labeling them fixtures
  will NOT break CI or the harness bootstrap path.
- Cross-link symmetry: ADR ↔ both fixture READMEs ↔ each other ↔ ADR
  index ↔ both greenfield-scaffold docs. No orphan references.

## Out-of-scope items NOT addressed

- **Moving these directories under `tests/fixtures/`** — explicitly
  deferred in ADR-0004's "What this decision explicitly does NOT
  cover" section. Higher churn, separate decision.
- **Removing `openapi.ts`** — ADR-0004 explicitly says keeping it as
  a fixture is fine; what must NOT happen is promoting it to a
  published contract.
- **Pre-existing ADR-index gap** (index rows pointing at non-existent
  files) — QCHECK flagged this as a defense-in-depth concern, but it
  is not introduced or materially worsened by this PR.

## Files changed

- `docs/adr/0004-apps-web-and-services-api-are-harness-fixtures.md` — NEW
- `apps/web/README.md` — NEW
- `services/api/README.md` — NEW
- `docs/adr/README.md` — index row added
- `docs/initiatives/greenfield-scaffold/README.md` — banner + bullet links
- `docs/initiatives/greenfield-scaffold/foundation-contract.md` — banner + bullet links + scoped "future slices" language
- `scripts/check-repo-static.sh` — 4 new `required_files` + 4 new assertions

## Evidence

- `npm run typecheck` → clean (baseline 0; no TS touched).
- `bash scripts/check-repo-static.sh` → `repo-static-checks-ok`.
- Manual: confirmed the static check fails on tampered state by
  temporarily removing the ADR link from one fixture README (failed
  with the expected error), then restoring (passed).
- Cross-link grep: `0004-apps-web-and-services-api-are-harness-fixtures.md`
  is referenced from `apps/web/README.md` (2x), `services/api/README.md`
  (2x), `docs/adr/README.md`, `docs/initiatives/greenfield-scaffold/README.md`
  (3x — banner + two bullets), and
  `docs/initiatives/greenfield-scaffold/foundation-contract.md`
  (3x — banner + two bullets).

## Wiring verification

No exports added (docs-only PR). The relevant "wiring" is bidirectional
markdown references plus static-check enforcement:

| Reference direction | Source | Target | Verified |
|---|---|---|---|
| Fixture READMEs → ADR | `apps/web/README.md`, `services/api/README.md` | `docs/adr/0004-…md` | static check |
| ADR → fixture READMEs | `docs/adr/0004-…md` Notes section | both READMEs | manual |
| Greenfield docs → ADR | `greenfield-scaffold/README.md`, `foundation-contract.md` | `docs/adr/0004-…md` | static check |
| Index → ADR | `docs/adr/README.md` row | `docs/adr/0004-…md` | file-vs-index symmetry check from PR #224 |

## Unresolved risks / known gaps

- A real product effort that ignores ADR-0004 and starts mutating
  `apps/web` / `services/api` directly will not be caught by any
  automated check — the static check verifies framing, not file
  contents. Mitigation: the fixture banner is now part of the visible
  README of each directory, so a PR that grows these into a real
  product without first writing a superseding ADR is highly visible
  in review.
- `validate:greenfield-scaffold.sh` continues to run as before;
  ADR-0004 does not change its behavior. If the team later decides to
  retire that validator, that is a separate cleanup.
- The greenfield-scaffold docs still describe a "current approved
  foundation" — that framing is partially preserved because retiring
  it entirely would have re-written too much initiative history. The
  per-bullet ADR-0004 annotations plus the top banner are the
  pragmatic boundary.
