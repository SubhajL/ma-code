---
name: backend-safety
description: Safe patterns for backend changes, validation, and rollback awareness
---

# backend-safety

Use this skill when changing APIs, services, data flow, auth, or backend tests.

## Checklist
1. Clarify the business rule.
2. Identify side effects and edge cases.
3. Confirm whether auth or permissions are involved.
4. Identify tests that should be updated.
5. Define rollback or mitigation if the change fails.

## Watch for
- silent behavior changes
- auth regressions
- hidden coupling
- missing migration or compatibility notes

## Completion evidence
- files changed
- test or validation output
- assumptions noted
- remaining risk noted
