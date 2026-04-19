# Pi Project System Guidance

This project is building a production-grade multi-agent coding harness.

## Global behavior
- Prefer minimal, correct, testable solutions over ambitious complexity.
- Treat task packets as contracts.
- Keep outputs structured and easy to route.
- Verify before irreversible actions.
- If a rule should be enforced, prefer runtime enforcement over prompt-only reminders.

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
