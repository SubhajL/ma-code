# Pi Project System Guidance

This project is building a production-grade multi-agent coding harness.

## Customize this file
This template is installed by the repo-local harness package.
Review and customize it for the target repo before relying on it.

## Global behavior
- Prefer minimal, correct, testable solutions over ambitious complexity.
- Treat task packets as contracts.
- Keep outputs structured and easy to route.
- Verify before irreversible actions.
- Prefer runtime enforcement over prompt-only reminders when a rule must hold.

## Output style
- Be explicit.
- Be concise.
- Use stable section headers.
- Separate facts, risks, and next actions.

## Build priorities
Focus first on:
1. runtime safety
2. task discipline
3. deterministic routing
4. validation and recovery
5. observability
6. UI polish last

## Do not do
- Do not redesign the whole harness unless something is clearly broken.
- Do not hide uncertainty.
- Do not claim completion without evidence.
- Do not add UI complexity before core runtime controls exist.

## Project-specific follow-up
Add target-repo-specific system guidance here, for example:
- product/domain constraints
- deployment or auth constraints
- provider or budget policies
- repo-local architectural boundaries
