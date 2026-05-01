# Planning Log — harness-051-live-proof

- Date: 2026-05-01
- Scope: Plan HARNESS-051 slice 2 bounded live-proof harness/report path.
- Status: ready
- Related coding log: `logs/coding/2026-05-01_harness-051-live-proof.md`

## Goal
- Add one bounded provider-backed live proof path for prompt semantic conformance without weakening the existing local fixture validator.
- Require dry/local validation first and refuse live proof when local validation fails.
- Capture markdown and JSON validation reports for the bounded live run.

## Scope
- Keep `scripts/validate-prompt-semantics.sh` as the primary local regression path.
- Add a dedicated wrapper script for the single live-proof path.
- Reuse the existing semantic parser/validator logic for live response verification.
- Add one inventory-backed live proof scenario for a critical prompt surface.
- Update docs/package/static wiring for discoverability.

## Files to Create or Edit
- `scripts/validate-prompt-semantics.sh`
- `scripts/validate-prompt-semantics-live.sh`
- `.pi/agent/validation/prompt-semantics.json`
- `package.json`
- `README.md`
- `.pi/agent/docs/validation_architecture.md`
- `.pi/agent/docs/file_map.md`
- `scripts/check-repo-static.sh`
- `logs/CURRENT.md`
- `logs/coding/2026-05-01_harness-051-live-proof.md`

## Acceptance Criteria
- A dedicated bounded live-proof script exists for HARNESS-051 slice 2.
- The live-proof script always runs the local semantic validator first.
- If the local path fails, no live provider-backed probe is attempted.
- One invocation performs at most one live proof and does not retry automatically.
- The live path captures markdown and JSON reports under `reports/validation/`.
- Docs/package/static wiring mention the local-first and single-live-proof workflow.

## Validation Plan
- RED: add a stub live-proof script plus wiring, then run the live-proof command and confirm it fails with a clear not-implemented reason after local validation.
- GREEN:
  - `bash scripts/validate-prompt-semantics.sh`
  - `bash scripts/validate-prompt-semantics-live.sh`
  - `bash scripts/validate-prompt-contracts.sh`
  - `bash scripts/check-repo-static.sh`
  - `git diff --check`
- Run the local semantic scope three consecutive times when relevant; run the bounded live proof exactly once.

## Risks
- Provider/auth/model availability can make the live path unavailable; that should report `SKIP`, not masquerade as product failure.
- Scope can drift into a multi-probe matrix; keep exactly one inventory-backed live proof.
- Reports are transient artifacts and should not widen the committed diff.
