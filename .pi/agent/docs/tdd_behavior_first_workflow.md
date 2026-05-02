# Behavior-First TDD Workflow

This document sharpens the harness TDD policy with behavior-first, one-test-at-a-time guidance.
It complements `g-coding` rather than replacing task discipline, RED/GREEN evidence, wiring checks, or review gates.

## Core policy
- Use behavior-first TDD: one failing behavior test, one minimal implementation, then repeat.
- Do not batch speculative tests ahead of implementation.
- Mock only system boundaries by default.
- Prefer tests through public interfaces and observable behavior.
- Refactor only while GREEN, then rerun the relevant tests after each refactor step.

## Good tests
Good tests should:
- describe what the system does, not how internals call each other
- exercise real code paths through a public interface
- survive internal refactors when behavior is unchanged
- cover a caller/user-visible behavior or important failure mode
- use one logical assertion or one coherent behavior per test

## Tests to avoid
Avoid tests that:
- target private helpers only because they are easy to call
- assert internal call order or call counts between modules you own
- mock internal collaborators instead of exercising behavior
- inspect storage or implementation details when a public retrieval/query path exists
- fail when a harmless internal refactor preserves behavior

## Mocking guidance
Mock or fake only true system boundaries by default:
- external APIs
- time/randomness
- filesystem boundaries when a local fake is safer
- databases when a test database or local stand-in is not practical

Do not mock code owned by the same module cluster unless there is a documented boundary reason.
When a mock is justified, prefer a small explicit adapter interface over a generic fetcher that forces conditional mock behavior.

## Per-cycle checklist
For each RED/GREEN cycle:
1. name the single behavior being tested
2. add or stub the smallest test for that behavior
3. run it and confirm it fails for the expected reason
4. implement only enough code to pass that test
5. run the test to GREEN
6. refactor only if needed while keeping tests GREEN
7. record exact RED/GREEN commands and key outcomes

## Planning checklist
Before coding a non-trivial slice, clarify:
- public interface affected
- first tracer-bullet behavior
- prioritized behaviors for later cycles
- behavior intentionally out of scope
- boundary dependencies and mock/fake strategy
- expected validation proof

## Relationship to harness gates
Behavior-first TDD does not remove existing harness requirements:
- active task with acceptance criteria
- non-main branch/worktree for mutation
- RED/GREEN evidence
- fast quality gates
- wiring verification for runtime components
- skeptical self-review and review handoff
- completion evidence before done
