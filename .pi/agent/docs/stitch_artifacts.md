# Stitch Screen Artifacts

Phase 4 adds deterministic mock-only Stitch screen artifact generation for reviewed Phase 3 prompt metadata.

## Purpose

- Convert a Phase 3 Stitch prompt and metadata file into a stable mock screen artifact.
- Preserve a reviewable artifact state before human screen approval.
- Prove the evidence shape for later live Stitch integration without calling Stitch yet.

## Runtime boundary

This surface is mock-only:

- It reads `docs/initiatives/<slug>/stitch-prompts/<slice-id>.prompt.md`.
- It reads `docs/initiatives/<slug>/stitch-prompts/<slice-id>.prompt.json`.
- It validates the Phase 3 prompt hash and source hashes against prompt, intake, PRD, backlog, and slice-plan files.
- It writes screen artifact files only when `--apply` is used.
- It hands off to Phase 5 screen artifact approval before FE implementation.
- It does not call Stitch.
- It does not call live services, provider APIs, or network APIs.
- It does not create task packets.
- It does not create queue jobs.
- It does not dispatch workers.
- It does not implement frontend or backend code.
- It does not expose an `--ignore-hash` bypass.

## CLI

Dry-run prints the mock artifact preview and planned paths without writing files:

```bash
npm run harness:stitch-artifact -- --initiative <slug> --slice <slice-id> --dry-run
```

Apply writes mock JSON and Markdown artifacts:

```bash
npm run harness:stitch-artifact -- --initiative <slug> --slice <slice-id> --apply
```

Use `--json` with either mode when a machine-readable preview or result is needed.

## Artifacts

- JSON: `docs/initiatives/<slug>/screen-artifacts/<slice-id>.mock-screen.json`
- Markdown: `docs/initiatives/<slug>/screen-artifacts/<slice-id>.mock-screen.md`

The JSON artifact records:

- `mode: mock`
- `phase: stitch_generation`
- `status: generated_mock`
- source prompt path, metadata path, and validated prompt hash
- screen list, screen states, data needs, and accessibility notes
- `liveStitchCalled: false`
- `taskPacketsCreated: false`
- `queueJobsCreated: false`
- `nextAllowedPhase: screen_approval`
- `nextBlockedUntil: human_artifact_review`

Phase 5 consumes this mock artifact and writes only a hash-bound approval sidecar at `docs/initiatives/<slug>/screen-artifacts/<slice-id>.approval.json` through `harness:screen-approval`.

## Schema

Schema path:

- `.pi/agent/state/schemas/stitch-screen-artifact.schema.json`

The schema is intentionally mock-only in Phase 4. Phase 13 live Stitch integration uses a separate additive adapter, CLI, and schema rather than weakening the Phase 4 mock artifact guarantees.

## Live Stitch migration path

Mock mode remains default through `npm run harness:stitch-artifact`. Explicit live generation uses:

```bash
npm run harness:live-stitch-artifact -- --initiative <slug> --slice <slice-id> --dry-run
npm run harness:live-stitch-artifact -- --initiative <slug> --slice <slice-id> --apply --approval-ref operator-approved-live-stitch:<ref>
```

Live generation writes managed payloads under `.pi/agent/artifacts/stitch/` and durable summaries under `docs/initiatives/<slug>/screen-artifacts/<slice-id>.live-screen.json`. Live output still requires human approval via the screen approval phase; generated live output is not approval. The live adapter does not create task packets, does not create queue jobs, does not dispatch workers, does not run as a daemon, and does not implement frontend or backend code. See `.pi/agent/docs/live_stitch_adapter.md`.

## Validation

Run:

```bash
./scripts/validate-stitch-artifacts.sh
```

The validator checks unit tests, integration tests, TypeScript compile coverage for the helper and CLI, package script wiring, schema shape, documentation boundary wording, and static references.

Screen approval validation is covered separately by `./scripts/validate-screen-artifact-approval.sh` and `.pi/agent/docs/screen_artifact_approval.md`.
