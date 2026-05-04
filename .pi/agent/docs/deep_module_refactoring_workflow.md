# Deep Module Refactoring Workflow

This document defines Phase 1 guidance for architecture/refactoring conversations that use deep-module vocabulary.
It is prompt/docs guidance only and does not add a new refactoring skill yet.

## Vocabulary
- Module: anything with an interface and an implementation.
- Interface: everything a caller must know to use the module correctly, including invariants, error modes, ordering, config, and performance expectations.
- Implementation: the code and behavior hidden behind the interface.
- Depth: leverage at the interface; a deep module hides substantial behavior behind a small stable interface.
- Seam: where the interface lives and where behavior can vary without editing callers.
- Adapter: a concrete implementation satisfying an interface at a seam.
- Leverage: capability callers get per unit of interface they must understand.
- Locality: how much change, bug fixing, and verification concentrate in one place.

## Core principles
- The interface is the test surface.
- Use the deletion test to distinguish shallow modules from deep modules.
- If deleting a module makes complexity disappear, it was likely shallow pass-through.
- If deleting a module spreads complexity across callers, it was likely earning its keep.
- One adapter is usually a hypothetical seam; two adapters make the seam real.

## Candidate discovery
Look for refactoring candidates when:
- understanding one concept requires bouncing across many small files
- modules expose many knobs for little behavior
- tests target private helpers instead of behavior at an interface
- internal collaborators are heavily mocked
- the same domain logic appears in multiple callers
- code changes reveal feature envy, primitive obsession, or duplicate orchestration logic

## Dependency categories
Classify dependencies before proposing a seam:
- in-process: pure computation or local memory; test directly through the module interface
- local-substitutable: dependencies with local test stand-ins such as test databases or in-memory file systems
- remote but owned: internal services that can use a port plus production/test adapters
- true external: third-party systems where mocks or fake adapters may be justified

## Refactoring plan shape
A bounded deepening proposal should include:
- files/modules involved
- current friction
- proposed module/interface shape
- what complexity moves behind the interface
- dependency category and adapter plan
- tests that survive internal refactors
- migration path if callers must change
- rollback or stop point

## Global `g-refactor` skill
This workflow is now also available through the global `g-refactor` skill in `packages/pi-g-skills/skills/`.
Use it when the user wants bounded refactor planning with explicit seam/interface/deletion-test reasoning.

## Phase boundary
This slice adds shared vocabulary, workflow guidance, and the global skill port only.
It does not add runtime refactor-plan execution or automatic template publishing.
