# services/api

> **HARNESS PILOT FIXTURE — NOT A RUNNABLE PRODUCT.**
>
> This directory is a fixture that exercises the harness's product-pipeline
> flow (intake → screen → contract → BE packet → worker execution). It is
> NOT the start of a real API service. See
> [ADR-0004](../../docs/adr/0004-apps-web-and-services-api-are-harness-fixtures.md)
> for the binding decision and what to do if you want to change this.

## What you'll find here

- `src/server.ts` — `createServerEntry()` returns a **plain object**
  describing a health path and a handler. It does NOT bind a port,
  does NOT start an HTTP server, does NOT listen for requests.
- `src/contracts/openapi.ts` — a Phase A OpenAPI artifact that
  documents the trivially-implemented health route plus
  intentionally-unimplemented placeholders for auth (`issue-008`) and
  a frontend client scaffold (`issue-012`). It is NOT a published API
  contract; do not generate clients against it.
- Subdirectories (`auth`, `db`, `observability`, `routes`) — placeholder
  structure mirroring a typical backend service, again for the
  harness pipeline to operate against.
- `package.json` — exists so harness lifecycle validators see a
  structurally-realistic monorepo layout. It is not a published
  package.

## What this is NOT

- It is not a starting point for a real service. Do not invest in
  making it runnable, do not wire it into CI as production code, do
  not promote `openapi.ts` to a published contract.
- If you want any of those, write a superseding ADR first
  (see ADR-0004's lifecycle section).

## See also

- [`docs/adr/0004-apps-web-and-services-api-are-harness-fixtures.md`](../../docs/adr/0004-apps-web-and-services-api-are-harness-fixtures.md)
- Sibling fixture: [`apps/web/README.md`](../../apps/web/README.md)
