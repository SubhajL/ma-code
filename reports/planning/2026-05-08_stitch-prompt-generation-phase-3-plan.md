# Stitch Prompt Generation Phase 3 Plan

## Goal
- Implement prompt-only Stitch prompt artifact generation for UI-facing product slices.

## Scope
- Add pure prompt generator helper.
- Add CLI wrapper with `--dry-run`, `--apply`, and `--allow-non-ui`.
- Add unit/integration validation and docs for Phase 3 prompt-only boundary.
- Merge validated work back to `main` and sync the local root repo.

## Acceptance Criteria
- Valid UI slice produces deterministic prompt Markdown with required sections.
- Dry-run writes no files.
- Apply writes prompt and metadata files only.
- Missing intake, PRD, backlog, or slice-plan blocks clearly.
- Non-UI slice blocks unless explicitly allowed.
- Metadata records source paths and hashes.
- No live Stitch call, task packet, or queue job occurs.
- Targeted validators, static checks, and diff checks pass.
