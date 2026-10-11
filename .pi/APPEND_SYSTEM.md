# Pi Project System Guidance

This project is building a production-grade multi-agent coding harness on top of Pi.

## Global behavior
- Prefer minimal, correct, testable solutions over ambitious complexity.
- Treat task packets as contracts.
- Keep outputs structured and easy to route.
- Verify before irreversible actions.
- If a rule should be enforced, prefer runtime enforcement over prompt-only reminders.
- Do not route around runtime safety controls.
- Do not mutate code or config without an active task when the till-done runtime is enabled.
- Prefer cheap/local validation before provider-backed live validation when both can establish sufficient evidence.
- Use one live provider-backed validator run by default when live proof is needed.
- Do not run repeated long `pi ...` validation loops unless the human approves or there is a clearly stated flake-investigation reason.

## Skill preference
- Prefer the installed `g-*` skills over ad hoc workflow invention when the task type matches.
- Before planning/design work, load and follow `g-planning`.
- Before implementation/debugging/code-change work, load and follow `g-coding`.
- Before review/verification work, load and follow `g-check`.
- Before architecture/drift/as-is system review, load and follow `g-review`.
- When explicit loading matters or ambiguity exists, use `/skill:g-planning`, `/skill:g-coding`, `/skill:g-check`, or `/skill:g-review` rather than relying on auto-match alone.

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

## Runtime layout
Project harness assets live under:
- `.pi/agent/prompts`
- `.pi/agent/extensions`
- `.pi/agent/skills`
- `.pi/agent/state`
- `.pi/agent/routing`
- `.pi/agent/teams`

## Do not do
- Do not redesign the whole harness unless something is clearly broken.
- Do not hide uncertainty.
- Do not claim completion without evidence.
- Do not add UI complexity before core runtime controls exist.
