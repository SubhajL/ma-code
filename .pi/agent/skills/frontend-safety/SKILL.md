---
name: frontend-safety
description: Safe patterns for frontend changes, accessibility, UI wiring, state boundaries, and client-side side effects
---

# frontend-safety

Use this skill when changing UI, routes, components, client state, styling, or frontend tests.

## Checklist
1. Clarify the user-visible behavior and accessibility expectations.
2. Identify route, component, state, and side-effect boundaries.
3. Reuse existing components, tokens, and design-system patterns before adding new UI primitives.
4. Confirm keyboard, focus, loading, error, and empty states when relevant.
5. Identify tests or manual validation that should be updated.
6. Define rollback or mitigation if the UI change fails.

## Watch for
- accessibility regressions
- hidden route or state coupling
- duplicate design-system primitives
- client-side side effects that outlive a component or route
- visual changes without validation notes
- missing loading/error/empty-state handling

## Completion evidence
- files changed
- test or validation output
- route/UI wiring proof
- accessibility assumptions noted
- remaining risk noted
