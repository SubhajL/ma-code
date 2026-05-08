# Live Stitch Adapter

Phase 13 adds an explicit live Stitch generation boundary for reviewed Phase 3 prompt metadata.

## Purpose

- Keep mock mode remains default for normal product-pipeline screen artifact generation.
- Allow an operator to make one bounded live Stitch call only when live generation is explicitly requested.
- Store raw or large live output in managed local artifact storage instead of durable initiative docs.
- Store only reviewable summaries, hashes, provenance, and managed artifact references under `docs/initiatives/<slug>/screen-artifacts/`.

## Runtime boundary

This surface is live-generation-only:

- It reads `docs/initiatives/<slug>/stitch-prompts/<slice-id>.prompt.md`.
- It reads `docs/initiatives/<slug>/stitch-prompts/<slice-id>.prompt.json`.
- It validates prompt hash and source hashes before dry-run or apply.
- `--dry-run` validates inputs and planned call shape, reports managed paths, and writes no files.
- `--apply` requires `--approval-ref` and environment/runtime auth such as `STITCH_API_KEY`, `STITCH_AUTH_TOKEN`, or `STITCH_LIVE_AUTH_TOKEN`.
- `--provider-command` is accepted only when policy explicitly allows it with `HARNESS_ALLOW_LIVE_STITCH_PROVIDER_COMMAND=1`.
- It blocks forbidden live args such as `--watch`, `--daemon`, `--server`, `--mcp`, and output overrides.
- It writes managed payload files only under `.pi/agent/artifacts/stitch/<slug>/<slice-id>/<run-id>/`.
- It writes durable summaries only under `docs/initiatives/<slug>/screen-artifacts/<slice-id>.live-screen.json` and `.md`.
- live output still requires human approval; generated live output is not an approval decision.
- It does not approve the screen.
- It does not create task packets.
- It does not create queue jobs.
- It does not dispatch workers.
- It does not implement frontend or backend code.
- It does not write protected runtime JSON.
- It does not run as a daemon.

## CLI

Dry-run validates and plans without writing files:

```bash
npm run harness:live-stitch-artifact -- --initiative <slug> --slice <slice-id> --dry-run
```

Apply performs one bounded live call and writes managed output plus durable summaries:

```bash
HARNESS_ALLOW_LIVE_STITCH_PROVIDER_COMMAND=1 \
STITCH_API_KEY=<set-outside-logs> \
npm run harness:live-stitch-artifact -- --initiative <slug> --slice <slice-id> --apply --approval-ref operator-approved-live-stitch:<ref> --provider-command <cmd>
```

Use `--json` with either mode for machine-readable output. Use `--timeout-ms <n>` to bound the live call.

## Artifacts

Durable JSON summary:

- `docs/initiatives/<slug>/screen-artifacts/<slice-id>.live-screen.json`

Durable Markdown summary:

- `docs/initiatives/<slug>/screen-artifacts/<slice-id>.live-screen.md`

Managed payload root:

- `.pi/agent/artifacts/stitch/<slug>/<slice-id>/<run-id>/`

Managed manifest:

- `.pi/agent/artifacts/stitch/<slug>/<slice-id>/<run-id>/manifest.json`

The durable JSON records:

- `mode: live`
- `phase: stitch_generation`
- `status: generated_live`, `blocked`, or `failed`
- live approval reference used to authorize generation
- source prompt path, metadata path, and validated prompt hash
- managed artifact root and manifest path
- output hashes for managed payloads
- `liveStitchCalled: true` after apply, `false` during dry-run planning
- `taskPacketsCreated: false`
- `queueJobsCreated: false`
- `requiresHumanApproval: true`
- `nextAllowedPhase: screen_approval`
- `nextBlockedUntil: human_artifact_review`

## Validation

Run:

```bash
./scripts/validate-live-stitch-artifacts.sh
```

The validator checks unit tests, integration tests, TypeScript compile coverage for the helper and CLI, package script wiring, schema shape, documentation boundary wording, and static no-worker-dispatch references.
