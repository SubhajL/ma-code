# Codex Skill Patterns for Pi Harness

This document captures the useful ideas from these Codex skills:
- `g-planning`
- `g-coding`
- `g-check`
- `g-review`

It does not recommend importing those skills wholesale.
Instead, it identifies the useful patterns and where they should live in the Pi harness.

## Adoption rule
Adapt patterns, not Codex-specific infrastructure.

Do adopt:
- good planning discipline
- Auggie-first semantic discovery with bounded fallback
- wiring verification
- evidence-backed review
- severity-ordered findings
- drift analysis for architecture reviews

Do not import as-is:
- `.codex/coding-log.current`
- Graphite-specific workflow assumptions
- Codex token-setting rules as literal harness policy
- Taskmaster-specific MCP flow as a required runtime dependency

## Useful ideas by skill

| Skill | Useful idea | Why it helps | Where to encode in Pi harness |
|---|---|---|---|
| `g-planning` | Auggie MCP first, then immediate fallback to local tools | improves codebase discovery without stalling work | role prompts, operator workflow, task packets |
| `g-planning` | decision-complete planning | reduces hidden assumptions before coding | `planning_lead`, planning docs, task packets |
| `g-planning` | explicit files-to-change and validation ideas | makes downstream execution less ad hoc | `planning_lead`, `build_lead`, task packets |
| `g-planning` | wiring verification planning | prevents uncalled or unregistered code | planning/build roles, task packets, task evidence |
| `g-coding` | smallest relevant failing/passing validation loop | keeps implementation grounded in proof | build workers, operator workflow, task evidence |
| `g-coding` | skeptical self-review before handoff | lowers shallow completion claims | build workers, quality flow |
| `g-coding` | wiring verification before done | catches library-code-without-call-site failures | build workers, validator expectations, task evidence |
| `g-check` | severity-ordered review findings | makes review decisions easier to act on | `reviewer_worker`, quality flow |
| `g-check` | exact file references and concrete fix direction | improves review quality and follow-up | `reviewer_worker`, `validator_worker`, validation docs |
| `g-check` | tests/validation needed per finding | makes review actionable | `reviewer_worker`, validation docs |
| `g-review` | intended-vs-implemented drift analysis | useful for architecture and system reviews | review docs, recovery/quality architecture |
| `g-review` | tactical vs strategic recommendations | keeps architecture advice bounded | `reviewer_worker`, `recovery_worker`, architecture docs |
| `g-review` | require migration path for big changes | reduces risky abstract redesign advice | planning/review docs, recovery decisions |

## Patterns adopted now

### 1. Codebase discovery policy
Policy:
- use Auggie MCP first when it is available and can be treated as non-blocking
- if Auggie is unavailable, errors, or cannot be bounded safely, fall back immediately to local tools
- local fallback means targeted `read`, `grep`/`rg`, `find`, and direct file inspection
- record which path was used in planning or review evidence

Primary encoding:
- `planning_lead`
- `research_worker`
- `validator_worker`
- operator workflow
- task packets

### 2. Decision-complete planning
Planning should lock down enough context that builders do not have to guess.

Planning should include, when relevant:
- clarified goal
- non-goals
- success criteria
- files to inspect/change
- validation ideas
- edge cases or failure modes
- wiring/registration checks for new components

Primary encoding:
- `planning_lead`
- team orchestration task packets
- operator workflow

### 3. Implementation proof discipline
Implementation should not rely on narration alone.
When relevant, builders should provide:
- smallest relevant validation command(s)
- failing/pass evidence when practical
- changed files
- wiring verification for new runtime components
- known gaps

Primary encoding:
- build workers
- task evidence rules
- validation and recovery architecture

### 4. Severity-ordered skeptical review
Review should be easy to act on.
The review lane should produce:
- severity-ordered findings
- exact file references when possible
- why the issue matters
- concrete fix direction
- suggested tests or validation to add

Primary encoding:
- `reviewer_worker`
- validation and recovery architecture
- quality flow docs

### 5. Architecture review discipline
System-level review should compare:
- intended design
- implemented design
- important drift
- tactical fixes
- strategic changes only when justified

Large architectural changes should include:
- pros
- cons
- migration path
- bounded rollout reasoning

Primary encoding:
- validation/recovery docs
- reviewer/recovery behavior
- architecture review process

## Wiring into the harness

### Roles
Wire into:
- `planning_lead`
- `research_worker`
- `build_lead`
- `backend_worker`
- `frontend_worker`
- `infra_worker`
- `reviewer_worker`
- `validator_worker`

### Process docs
Wire into:
- `.pi/agent/docs/operator_workflow.md`
- `.pi/agent/docs/team_orchestration_architecture.md`
- `.pi/agent/docs/validation_recovery_architecture.md`

### Task semantics and packets
Wire into:
- `.pi/agent/docs/task_schema_semantics.md`
- task packet requirements in `.pi/agent/docs/team_orchestration_architecture.md`

## Explicit non-goals
This adoption does not mean:
- Codex skills are copied directly into Pi
- Graphite becomes a required harness dependency
- Auggie becomes mandatory even when unavailable
- Taskmaster MCP becomes the harness task system

## Practical result
After this wiring, the harness should gain:
- better codebase discovery
- clearer planning packets
- stronger implementation proof
- more actionable review output
- architecture review that is less hand-wavy
