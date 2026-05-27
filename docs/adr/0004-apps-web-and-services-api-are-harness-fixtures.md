# ADR-0004: `apps/web/` and `services/api/` are harness pilot fixtures, not a product foundation

- **Status:** Accepted
- **Date:** 2026-05-27
- **Supersedes:** none
- **Superseded-By:** none

## Context

The repo contains two top-level directories that *look* like the start of
a real product:

- `apps/web/` — a `package.json`, `src/App.tsx`, `src/main.tsx`, plus
  subdirectories for `api`, `auth`, `components`, `lib`,
  `observability`, and `styles`.
- `services/api/` — a `package.json`, `src/server.ts`, plus
  subdirectories for `auth`, `contracts`, `db`, `observability`, and
  `routes`.

On casual inspection these look like a monorepo product foundation
("web app talks to API service"). The actual code says otherwise:

- `services/api/src/server.ts` exports a `createServerEntry()` function
  that returns a plain object describing a health path and a handler.
  It does not start an HTTP server, does not bind a port, does not
  listen for requests.
- `apps/web/src/App.tsx` defines `App()` as a function that returns a
  string of HTML markup. It is not a React component tree and is not
  mounted by any React runtime.
- `services/api/src/contracts/openapi.ts` declares a Phase A contract
  whose primary purpose is to record `workerImplementationDependency`
  references to harness issue IDs (`issue-008` for auth,
  `issue-012` for the frontend client). Endpoints beyond the trivial
  health route are intentionally unimplemented.

These directories exist to give the **harness's product pipeline**
something concrete to point at while it exercises the
intake → screen → contract → FE/BE packet → worker-execution flow.
They have been in this fixture-only shape for weeks. No active product
development is happening in them.

The 2026-05-27 system review flagged this as a MEDIUM concern:

> Product scaffold is mostly a fixture/contract artifact, not a
> runnable app. `services/api/src/server.ts:1-13` exposes a
> server-entry object, not an HTTP server; `apps/web/src/App.tsx:22-33`
> returns markup as a string rather than a React component tree;
> `openapi.ts` documents planned endpoints that are intentionally
> unimplemented. That is fine for a harness pilot, but misleading if
> presented as a real product foundation.

This ADR captures the answer so the question does not keep coming up.

## Decision

`apps/web/` and `services/api/` are **harness pilot fixtures**, not a
product foundation. Specifically:

- Their purpose is to exercise the product-pipeline harness flow
  (`harness:product-intake`, `harness:stitch-prompt`,
  `harness:slice-contract`, `harness:fe-packet`, `harness:be-packet`,
  `harness:worker-execute`, `harness:pr-lifecycle`) end-to-end against
  something concrete.
- Their `package.json` files exist so the harness's lifecycle
  validators can be run against a structurally-realistic monorepo
  layout. They are NOT a published product surface.
- The `services/api/src/contracts/openapi.ts` artifact documents the
  Phase A contract for harness-tracking purposes, NOT as a published
  API contract for external consumers.
- Each directory carries a `README.md` whose first lines clearly state
  that it is a harness pilot fixture and link to this ADR.

### What this decision explicitly does NOT cover

- **Whether these dirs should be moved under `tests/fixtures/`** or to
  a sibling `fixtures/` tree. That is a higher-churn change and a
  separate decision; this ADR documents what they are *today*, not
  where they live. A future cleanup PR may move them after team
  agreement.
- **Whether the harness should ever produce a real product**. If real
  product work ever starts in this repo, that work requires a new ADR
  that supersedes this one and decides (a) where the product lives
  in the repo layout, (b) what runtime/framework choices apply, (c)
  what deploy story attaches, and (d) what becomes of these fixtures
  (rename, replace, delete, keep alongside). Until then, nobody
  should rely on these directories as a starting point.
- **The OpenAPI contract's continued existence**. Keeping
  `openapi.ts` around as a fixture is fine; it does not have to be
  removed. What must NOT happen is promoting it to a published
  contract or generating clients against it as if it were a real API.

## Consequences

Positive:

- A future contributor who opens `apps/web/` or `services/api/` and
  expects to find a real product immediately sees the fixture banner
  and knows to look elsewhere.
- The system review's recurring "is this a product?" drift is
  resolved against a single authoritative place. Disagreements about
  whether to grow these dirs into real services are now ADR-shaped:
  write a superseding ADR or accept the current framing.
- Engineering work that would otherwise be wasted (wiring `server.ts`
  to a real HTTP server, building a React tree in `App.tsx`,
  publishing `openapi.ts`) is explicitly out of scope. Anyone who
  wants that work done has a clear path: argue the superseding ADR
  first.

Negative:

- The dirs continue to look like a product foundation in tools that
  scan the repo by directory name (monorepo scanners, IDE workspace
  pickers). The README banner mitigates this, but the cosmetic gap
  remains.
- Operators or new contributors who skim only the top-level repo tree
  may still be briefly confused. The fixture README is the
  cheapest-possible mitigation; a future move to `tests/fixtures/`
  would resolve the appearance issue but at higher churn cost.

## Notes

- Fixture markers:
  [`apps/web/README.md`](../../apps/web/README.md),
  [`services/api/README.md`](../../services/api/README.md).
- Static-check enforcement: `scripts/check-repo-static.sh` asserts
  that both fixture READMEs contain the word "fixture" and link to
  this ADR.
- System review entry that motivated this ADR: the
  2026-05-27 "Product scaffold is mostly a fixture/contract artifact"
  MEDIUM finding in
  `coding-logs/2026-05-26-09-26-58 Coding Log (weekly-summary-2026-05-19_to_2026-05-26).md`.
