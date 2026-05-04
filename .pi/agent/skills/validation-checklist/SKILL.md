---
name: validation-checklist
description: Evidence-focused validation checklist for task completion
---

# validation-checklist

Use this skill before marking a task complete.

## Required checks
1. Compare work to acceptance criteria.
2. Review evidence, not only claims.
3. Confirm changed files match stated scope.
4. Confirm tests or checks were actually run when appropriate for the task class.
5. When tests are relevant, confirm evidence includes RED/GREEN commands or an explicit reason RED was not practical.
6. Challenge tests that depend on private helpers, internal call order, or unjustified owned-collaborator mocks.
7. Confirm the named behavior under test and the public interface are explicit when behavior-first TDD is claimed.
8. Confirm diff-review expectations were satisfied for non-docs/non-research task classes.
9. Record missing proof clearly.
10. Return an explicit validation outcome: `pass`, `fail`, or `blocked`.

## Completion rule
If evidence is weak, the task is not done.
Docs/research tasks may use lighter validation, but they are not proof-free exceptions.
