# apps/web

> **HARNESS PILOT FIXTURE — NOT A RUNNABLE PRODUCT.**
>
> This directory is a fixture that exercises the harness's product-pipeline
> flow (intake → screen → contract → FE packet → worker execution). It is
> NOT the start of a real web app. See
> [ADR-0004](../../docs/adr/0004-apps-web-and-services-api-are-harness-fixtures.md)
> for the binding decision and what to do if you want to change this.

## What you'll find here

- `src/App.tsx` — a function that **returns an HTML string**, not a
  React component tree. There is no React reconciler in use anywhere
  in this directory. `App.tsx` exists so the harness's
  frontend-packet generator and worker-execution lane have a
  concrete file shape to operate against.
- `src/main.tsx` — writes HTML into `document.body` via `innerHTML`
  when a browser `document` is present at module load. It is NOT
  driven by `react-dom`/`createRoot`; it is a placeholder mount that
  illustrates the bootstrap shape without bringing a real React
  runtime along.
- Subdirectories (`api`, `auth`, `components`, `lib`,
  `observability`, `styles`) — placeholder structure mirroring a
  typical React app, again for the harness pipeline to point at.
- `package.json` — exists so harness lifecycle validators see a
  structurally-realistic monorepo layout. It is not a published
  package.

## What this is NOT

- It is not a starting point for a real product. Do not invest in
  making it runnable, do not wire it into CI as production code, do
  not import from it in non-fixture code.
- If you want any of those, write a superseding ADR first
  (see ADR-0004's lifecycle section).

## See also

- [`docs/adr/0004-apps-web-and-services-api-are-harness-fixtures.md`](../../docs/adr/0004-apps-web-and-services-api-are-harness-fixtures.md)
- Sibling fixture: [`services/api/README.md`](../../services/api/README.md)
