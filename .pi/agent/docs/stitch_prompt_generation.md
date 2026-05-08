# Stitch Prompt Generation

Phase 3 adds deterministic prompt-only Stitch prompt artifact generation for UI-facing product slices.

## Purpose

- Convert initiative intake, PRD, backlog, and `slice-plan.json` data into a stable Markdown prompt.
- Preserve a metadata chain from sources to prompt artifact before any Stitch generation occurs.
- Give operators a reviewable prompt boundary before mocked or live screen generation in later phases.
- Phase 4 mock screen artifact generation is documented separately in `.pi/agent/docs/stitch_artifacts.md` and consumes this metadata after human prompt review.

## Runtime boundary

This surface is prompt generation only:

- It reads `docs/initiatives/<slug>/intake.json`.
- It reads `docs/initiatives/<slug>/prd.md`.
- It reads `docs/initiatives/<slug>/backlog.md`.
- It reads `docs/initiatives/<slug>/slice-plan.json`.
- It writes prompt artifacts only when `--apply` is used.
- It does not call Stitch.
- It does not call live services or network APIs.
- It does not create task packets.
- It does not create queue jobs.
- It does not dispatch workers.
- It does not implement frontend or backend code.

## CLI

Dry-run prints the generated prompt and planned artifact paths without writing files:

```bash
npm run harness:stitch-prompt -- --initiative <slug> --slice <slice-id> --dry-run
```

Apply writes prompt and metadata artifacts:

```bash
npm run harness:stitch-prompt -- --initiative <slug> --slice <slice-id> --apply
```

Use `--allow-non-ui` only when an operator intentionally wants a prompt artifact for a slice that lacks UI-facing markers.

## Artifacts

- Prompt: `docs/initiatives/<slug>/stitch-prompts/<slice-id>.prompt.md`
- Metadata: `docs/initiatives/<slug>/stitch-prompts/<slice-id>.prompt.json`

Metadata records:

- source paths for intake, PRD, backlog, and slice plan
- SHA-256 prompt hash
- SHA-256 source hashes
- target screens
- required prompt sections
- `nextAllowedPhase: stitch_generation`
- `nextBlockedUntil: human_prompt_review`

Phase 4 consumes this metadata, validates the recorded prompt hash and source hashes, and writes mock screen artifacts under `docs/initiatives/<slug>/screen-artifacts/` only through `harness:stitch-artifact --apply`.

## Required prompt sections

- Product context
- Slice goal
- User stories covered
- Target screens
- Screen states: default, loading, empty, error, success
- Data needs and mocked data assumptions
- Accessibility expectations
- Visual/design constraints
- Existing UI/design-system reuse notes
- Out-of-scope behaviors
- Explicit instruction to generate screens only for this slice, not invent backend behavior, and not implement code

## Validation

Run:

```bash
./scripts/validate-stitch-prompts.sh
```

The validator checks unit tests, integration tests, TypeScript compile coverage for the helper and CLI, package script wiring, documentation boundary wording, and required static references.
