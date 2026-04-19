# Pi Multi-Agent Harness Build Prompts and Model Routing Guide

## What this file is

This document is the **practical companion** to the layman's build plan.

The first document explained **what to build** and **why**.

This document explains:

1. **what prompts to use**
2. **which agent should receive which prompt**
3. **which model family to use for each role**
4. **when to use higher reasoning / thinking**
5. **when to use faster, cheaper modes**
6. **how to create the harness step by step**

This is written in a way that lets you either:

- copy prompts directly into Pi roles and task files, or
- adapt them into your own prompt templates and extension logic

---

# Important note before you begin

These prompts are meant to create a **stable engineering system**, not a flashy demo.

So the prompts below are designed to encourage:

- clear scope
- explicit evidence
- limited responsibility per role
- safe execution
- minimal confusion
- review and validation before completion

That is the correct way to build a trustworthy harness.

---

# Part 1: Answer to your question about models and thinking modes

## Did the previous file already specify the right models and thinking modes for each worker and step?

**Partly, but not fully enough.**

The earlier file did specify the **general routing idea**:

- use **Claude** for harder reasoning, planning, architecture, and review
- use **OpenAI** for lighter helper work, summaries, repetitive tasks, and lower-cost support work

But it did **not yet give a step-by-step worker-by-worker matrix** covering:

- exact model lane recommendations per role
- whether that role should use **high thinking**, **medium thinking**, or **low/no thinking**
- when to escalate from a cheaper model to a stronger model
- when a role should switch providers

This file fixes that gap.

---

# Part 2: Simple model and thinking policy

Do not overcomplicate this at first.

Use a small set of operating modes.

## Thinking mode definitions in plain English

### Low thinking
Use this when the task is:
- repetitive
- simple
- mechanical
- mostly formatting or summarization
- easy to verify

Examples:
- summarizing changed files
- classifying tasks
- rewriting documentation
- generating simple checklists

### Medium thinking
Use this when the task is:
- moderately complex
- multi-step but still bounded
- requires understanding repo structure
- requires judgment but not deep design work

Examples:
- creating a feature plan
- writing a frontend component from an existing pattern
- updating a backend service with known requirements
- reviewing a small diff

### High thinking
Use this when the task is:
- architectural
- ambiguous
- high-risk
- large in scope
- likely to fail if rushed
- hard to verify without real reasoning

Examples:
- architecture decisions
- breaking down a complex goal
- deep code review
- debugging tricky failures
- resolving conflicting worker outputs
- recovery and retry strategy

---

# Part 3: Recommended model routing by role

These are practical recommendations, not absolute laws.

Use them as defaults.

## 1. Orchestrator

### Recommended provider
Claude first

### Thinking mode
High

### Why
The orchestrator must:
- understand big goals
- break work into meaningful parts
- choose teams
- route fallback behavior
- decide whether work is actually complete

This is where strong reasoning matters most.

### Fallback
Use a strong OpenAI model only if needed, but Claude should be the default lead brain for this role.

---

## 2. Planning Lead

### Recommended provider
Claude first

### Thinking mode
High for complex goals, medium for smaller feature work

### Why
Planning quality determines whether the rest of the system succeeds or wastes time.

A weak plan creates:
- duplicated work
- missing requirements
- broken sequencing
- poor validation coverage

---

## 3. Build Lead

### Recommended provider
Claude first

### Thinking mode
Medium to high

### Why
The build lead needs:
- sequencing judgment
- awareness of file overlap
- task routing
- escalation discipline

It does not need to do the hardest coding itself, but it does need good coordination judgment.

---

## 4. Quality Lead

### Recommended provider
Claude first

### Thinking mode
High

### Why
This role must be skeptical.

It should:
- compare outputs against requirements
- detect incomplete work
- identify shallow success claims
- send things back for repair

This is not a role for shallow reasoning.

---

## 5. Research Worker

### Recommended provider
OpenAI first for cheap discovery
Claude if the repo is large or ambiguous

### Thinking mode
Low to medium for discovery
High only when synthesizing complex findings

### Why
A lot of research work is just:
- file search
- code inventory
- docs lookup
- pattern collection

That does not always need your strongest model.

But if the findings are messy or conflicting, escalate to Claude.

---

## 6. Frontend Worker

### Recommended provider
Claude first for non-trivial UI work
OpenAI for simpler scaffolding or small component edits

### Thinking mode
Medium by default
High for tricky UX logic or complex state flow

### Why
Frontend work often looks easy but breaks in subtle ways:
- state management
- props flow
- API integration
- visual consistency
- accessibility
- testing

So medium is the safe default.

---

## 7. Backend Worker

### Recommended provider
Claude first

### Thinking mode
Medium by default
High for business logic, migrations, auth, concurrency, or debugging

### Why
Backend work has hidden risk:
- edge cases
- data integrity
- auth logic
- side effects
- integration failures

Use stronger reasoning more often here.

---

## 8. Infra Worker

### Recommended provider
Claude first for anything touching deployment or CI
OpenAI for simple script cleanup or template drafting

### Thinking mode
Medium to high

### Why
Infra mistakes can cause broad damage.

Use stronger reasoning for:
- CI/CD
- Docker
- deployment scripts
- secrets handling
- environment configuration
- build pipelines

---

## 9. Reviewer Worker

### Recommended provider
Claude first

### Thinking mode
High

### Why
Review is fundamentally a reasoning task.

This agent must:
- detect what changed
- judge whether it was correct
- compare it to the goal
- notice hidden risks
- identify overreach

This is exactly where stronger reasoning pays off.

---

## 10. Validator Worker

### Recommended provider
Claude first for interpreting results
OpenAI can assist with simple result formatting

### Thinking mode
Medium to high

### Why
Validation is not just running commands.

The validator must decide:
- did the tests really cover the requirement?
- does the output prove completion?
- is the result only superficially correct?
- should the task be accepted or rejected?

---

## 11. Docs Worker

### Recommended provider
OpenAI first
Claude if the changes are complex or architectural

### Thinking mode
Low to medium

### Why
Documentation is often a lower-cost task.

Good uses:
- summarize changes
- list files touched
- convert technical notes into plain English
- draft release notes

Escalate only if the subject is highly technical or high stakes.

---

## 12. Recovery Worker

### Recommended provider
Claude first

### Thinking mode
High

### Why
Recovery requires real diagnosis:
- what failed?
- why did it fail?
- should we retry?
- should we switch model?
- should we roll back?
- should we stop?

This is a high-judgment role.

---

# Part 4: One-page quick matrix

| Role | Default Provider | Default Thinking | Escalate When |
|---|---|---|---|
| Orchestrator | Claude | High | Always high by default |
| Planning Lead | Claude | High | Ambiguous scope or complex feature |
| Build Lead | Claude | Medium/High | Worker conflict or sequencing risk |
| Quality Lead | Claude | High | Always strong reasoning |
| Research Worker | OpenAI | Low/Medium | Repo ambiguity or unclear findings |
| Frontend Worker | Claude | Medium | Complex state/UI logic |
| Backend Worker | Claude | Medium | Auth, data, edge cases, debugging |
| Infra Worker | Claude | Medium/High | CI, deploy, env, secrets |
| Reviewer | Claude | High | Always strong reasoning |
| Validator | Claude | Medium/High | Ambiguous or incomplete evidence |
| Docs Worker | OpenAI | Low/Medium | Architecture-heavy explanation |
| Recovery Worker | Claude | High | Always strong reasoning |

---

# Part 5: Build prompts by stage

This section walks through the harness creation process itself.

In other words, these are the prompts you use to **build the system**.

---

# Stage 1: Create the basic harness skeleton

## Goal of this stage

You are not creating advanced agent behavior yet.

You are creating:
- folders
- basic config
- role definitions
- prompt files
- team files
- state files
- task schema

## Prompt 1A: Ask the system to scaffold the harness layout

Use this with a strong model in high thinking mode.

```text
You are helping me build a production-grade Pi-based multi-agent coding harness on macOS.

Create a clean folder and file scaffold for this system with the following goals:
- single-machine operation
- orchestrator, leads, and workers
- persistent state per role
- worktree-friendly layout
- prompts, skills, extensions, packages, teams, logs, plans, and reports
- safe defaults for engineering work

Output:
1. the proposed folder tree
2. the purpose of each folder
3. the first set of files that should exist
4. suggested naming conventions
5. a short explanation of why this structure is stable

Do not invent unnecessary complexity. Prefer a structure that is easy to maintain.
```

## Prompt 1B: Ask for the initial file creation commands

```text
Using the folder structure you proposed, generate exact macOS shell commands to create the directories and placeholder files.

Requirements:
- commands should be safe
- commands should be easy to run manually
- assume zsh on macOS
- include comments explaining what each group of commands does
```

---

# Stage 2: Create the global rules

## Goal of this stage

Build the top-level policy file that governs all agents.

This is one of the most important files in the whole system.

## Prompt 2A: Create the global AGENTS.md

Use Claude with high thinking.

```text
Write a production-grade AGENTS.md file for a Pi-based multi-agent coding harness.

The file should define:
- branch and worktree rules
- coding safety rules
- validation requirements
- escalation policy
- task completion requirements
- destructive command restrictions
- expectations for evidence before marking work complete
- role boundaries
- general communication style

Tone:
- clear
- firm
- concise
- engineering-focused

The file should be practical and enforceable, not motivational.
```

## Prompt 2B: Refine the policy for real-world use

```text
Review this AGENTS.md file like a senior engineering lead.

Tell me:
1. what parts are too vague
2. what parts are too strict
3. what parts are missing for a multi-agent coding system
4. what rules would reduce accidental repo damage
5. what rules would improve trustworthiness

Then produce a revised version.
```

---

# Stage 3: Create the role prompts

## Goal of this stage

Give each role a clear job.

Each prompt should be short, sharp, and narrow.

## Prompt 3A: Generate role prompts all at once

Use Claude with high thinking.

```text
Create role prompt files for the following roles in a Pi-based multi-agent coding harness:

- orchestrator
- planning_lead
- build_lead
- quality_lead
- research_worker
- frontend_worker
- backend_worker
- infra_worker
- reviewer_worker
- validator_worker
- docs_worker
- recovery_worker

Requirements:
- each prompt must define what the role does
- each prompt must define what the role must not do
- each prompt must define when the role should escalate
- each prompt must define what evidence the role should produce
- prompts should be short enough to remain stable
- prompts should avoid hype and fluff
- prompts should be suitable for production engineering work

Output each prompt in its own markdown section with a suggested filename.
```

## Prompt 3B: Stress-test the role boundaries

```text
Review these role prompts for overlap, confusion, and hidden conflict.

For each role:
- identify where it may overlap too much with another role
- identify where responsibilities are unclear
- identify where escalation logic is weak
- identify where the role may overreach

Then produce improved versions with clearer boundaries.
```

---

# Stage 4: Create team definitions

## Goal of this stage

Define how the roles group together.

## Prompt 4A: Create simple team definitions

Use medium to high thinking.

```text
Design a first-version team structure for this Pi-based harness.

We want:
- one orchestrator
- one planning team
- one build team
- one quality team
- a recovery path when things fail

Output:
1. the team names
2. which roles belong to each team
3. when each team should be activated
4. which team dependencies matter
5. simple YAML examples for each team
```

## Prompt 4B: Create a routing policy

```text
Using the team structure above, define a routing policy for the orchestrator.

The policy should explain:
- when to call the planning team
- when to call the build team
- when to call quality
- when to invoke recovery
- when to stop and ask for human input
- when to retry with another model
- when work can be parallelized

Make this policy operational and concrete.
```

---

# Stage 5: Create the till-done task system

## Goal of this stage

Force agents to work through visible tasks instead of drifting.

## Prompt 5A: Create the task schema

Use Claude high thinking.

```text
Design a production-friendly task schema for a Pi-based multi-agent coding harness.

The schema should support:
- task id
- title
- owner role
- status
- acceptance criteria
- evidence
- dependencies
- retry count
- notes
- timestamps

Statuses should support at least:
- queued
- in_progress
- review
- blocked
- done
- failed

Output:
1. a JSON example
2. field explanations
3. examples of good acceptance criteria
4. examples of weak acceptance criteria to avoid
```

## Prompt 5B: Define the till-done rules

```text
Write a rule set for a till-done workflow in a multi-agent coding system.

The rules should ensure:
- agents cannot mutate code without first creating or claiming a task
- agents must state expected output before starting
- agents must attach evidence before completion
- tasks cannot be cleared silently
- incomplete work remains visible
- blocked work is escalated appropriately

Make the rules practical for extension logic and human review.
```

## Prompt 5C: Create the extension behavior spec

```text
Create a plain-English behavior specification for a Pi extension that enforces the till-done workflow.

Include:
- what happens on user input
- what happens before tool calls
- what happens when an agent tries to clear tasks
- what happens when evidence is missing
- what happens when a task is blocked
- how this should appear in logs or status UI
```

---

# Stage 6: Create worktree rules and safe execution rules

## Goal of this stage

Protect the repo.

## Prompt 6A: Design worktree policy

```text
Write a worktree policy for a single-machine multi-agent coding harness.

The policy should explain:
- when to create a worktree
- how to name branches and worktrees
- when multiple workers can operate in parallel
- when workers must not share a worktree
- how completed work should be handed back for review
- how to reduce merge collisions

Keep the explanation practical and repo-safe.
```

## Prompt 6B: Define dangerous command restrictions

Use Claude high thinking.

```text
Create a practical dangerous-command policy for a Pi-based coding harness.

We want to block or heavily restrict:
- destructive shell commands
- direct edits to protected branches
- writes to sensitive env files
- broad file deletions
- commands that can corrupt the workspace

Output:
1. classes of dangerous commands
2. default handling per class
3. what requires approval
4. what should always be blocked
5. how the agent should explain a blocked action
```

---

# Stage 7: Create model routing logic

## Goal of this stage

Tell the harness which model to use for which task.

## Prompt 7A: Generate provider routing policy

```text
Design a model routing policy for a Pi-based multi-agent coding harness using Claude and OpenAI.

We need:
- role-based defaults
- task-based overrides
- fallback behavior
- cost-aware use of cheaper models
- escalation conditions for hard tasks
- guidance on when to use low, medium, or high thinking

Output:
1. a policy table
2. practical examples
3. rules for retrying on a different provider
4. rules for not overusing expensive reasoning
```

## Prompt 7B: Generate a human-readable model cheat sheet

```text
Convert the routing policy into a one-page cheat sheet for an engineer operating the harness.

It should answer:
- who uses Claude by default?
- who uses OpenAI by default?
- when should I switch to higher thinking?
- when should I drop to faster cheaper execution?
- when should I stop and escalate instead of retrying?
```

---

# Stage 8: Create logging and evidence prompts

## Goal of this stage

Make the system explain itself well enough to trust it.

## Prompt 8A: Create a run log format

```text
Design a run-log template for a multi-agent coding harness.

Each run log should capture:
- goal
- plan summary
- team assignments
- tasks created
- model/provider choices
- retries and failures
- validation results
- final status
- next recommended action

Make the structure easy for a human to inspect quickly.
```

## Prompt 8B: Create an evidence standard

```text
Define an evidence standard for task completion in a coding harness.

A task should not be considered complete unless there is enough evidence.

Provide guidance on acceptable evidence for:
- code changes
- tests
- validation commands
- doc updates
- UI work
- backend work
- infra work

Also explain what weak evidence looks like.
```

---

# Stage 9: Create the validation prompts

## Goal of this stage

Make sure validation is strict and meaningful.

## Prompt 9A: Validator prompt

Use Claude high thinking.

```text
Write a strong validator prompt for a Pi-based multi-agent coding harness.

The validator must:
- be skeptical
- compare work against acceptance criteria
- inspect evidence
- recommend rejection if evidence is weak
- request more proof if needed
- clearly separate fact from assumption

The validator should never accept a task just because another agent claims it is complete.
```

## Prompt 9B: Reviewer prompt

```text
Write a reviewer prompt for a Pi-based multi-agent coding harness.

The reviewer should:
- inspect diffs critically
- identify hidden risk
- spot overengineering
- spot underimplementation
- note style, architecture, and maintainability concerns
- recommend fixes clearly

The reviewer should not rewrite the entire solution unless explicitly asked.
```

---

# Stage 10: Create recovery prompts

## Goal of this stage

Teach the system how to fail well.

## Prompt 10A: Recovery worker prompt

Use Claude high thinking.

```text
Write a recovery worker prompt for a Pi-based multi-agent coding harness.

This role is responsible for:
- analyzing failures
- identifying likely root causes
- deciding whether retrying makes sense
- deciding whether to switch provider or model strength
- deciding whether rollback is safer
- producing a recovery recommendation

This prompt should make the role calm, analytical, and conservative.
```

## Prompt 10B: Retry policy prompt

```text
Design a retry and escalation policy for the harness.

The policy should explain:
- when to retry the same role with the same model
- when to retry the same role with a stronger model
- when to switch providers
- when to escalate to a lead
- when to stop the run
- when to ask for human help

Optimize for stability, not for endless retries.
```

---

# Stage 11: Create the docs and reporting prompts

## Goal of this stage

Ensure every run leaves behind useful documentation.

## Prompt 11A: Docs worker prompt

```text
Write a docs worker prompt for a multi-agent coding harness.

The docs worker should:
- summarize completed work clearly
- list changed files
- describe validation that was run
- note unresolved issues
- suggest next steps
- explain changes in plain English when possible

The docs worker should avoid inventing certainty where uncertainty remains.
```

## Prompt 11B: Final report template prompt

```text
Create a final run report template for a multi-agent coding harness.

The report should include:
- original goal
- final status
- what was completed
- what was not completed
- evidence summary
- validation summary
- risks or caveats
- recommended next action
```

---

# Stage 12: Create the job queue prompts

## Goal of this stage

Support long-running autonomy without chaos.

## Prompt 12A: Queue schema

```text
Design a job queue schema for a single-machine multi-agent coding harness.

Each job should support:
- id
- goal
- priority
- scope
- status
- team assignment
- budget
- stop conditions
- created time
- updated time
- dependencies

Output a JSON example and explain how the orchestrator should use it.
```

## Prompt 12B: Bounded autonomy rules

Use Claude high thinking.

```text
Write bounded-autonomy rules for a coding harness.

The system should:
- operate on one bounded job at a time unless safe parallelism is available
- avoid open-ended wandering
- stop when evidence is weak
- stop when cost or retry limits are reached
- produce a report before starting the next job

Make the rules operational and safety-oriented.
```

---

# Part 6: Recommended prompt order for actually building the harness

If you want the shortest working path, run them in this order:

1. Prompt 1A
2. Prompt 1B
3. Prompt 2A
4. Prompt 2B
5. Prompt 3A
6. Prompt 3B
7. Prompt 4A
8. Prompt 4B
9. Prompt 5A
10. Prompt 5B
11. Prompt 5C
12. Prompt 6A
13. Prompt 6B
14. Prompt 7A
15. Prompt 7B
16. Prompt 8A
17. Prompt 8B
18. Prompt 9A
19. Prompt 9B
20. Prompt 10A
21. Prompt 10B
22. Prompt 11A
23. Prompt 11B
24. Prompt 12A
25. Prompt 12B

That sequence builds the harness from the ground up in a logical order.

---

# Part 7: Short “series prompts” for each build phase

If you prefer fewer, larger prompts instead of many smaller prompts, use these.

## Series Prompt A: Build the foundation

```text
Help me design the foundation of a production-grade Pi-based multi-agent coding harness on macOS.

I want:
- a stable folder structure
- a strong AGENTS.md policy
- clear role prompts
- simple team definitions
- persistent state folders
- safe defaults

Please produce:
1. the structure
2. the core policy
3. role prompts
4. team YAML examples
5. recommended first files to create
```

## Series Prompt B: Build the workflow system

```text
Help me design the workflow system for a Pi-based multi-agent coding harness.

I want:
- a till-done task model
- evidence requirements
- logging templates
- validation rules
- retry and escalation logic
- worktree policy
- dangerous command policy

Please produce:
1. task schema
2. till-done rules
3. evidence standard
4. retry policy
5. worktree policy
6. blocked-command policy
```

## Series Prompt C: Build the autonomy layer

```text
Help me design the autonomy layer for a single-machine Pi-based multi-agent coding harness.

I want:
- a job queue
- bounded autonomy
- orchestrator routing rules
- model/provider routing rules
- long-running but safe workflows
- daily reporting behavior

Please produce:
1. queue schema
2. autonomy rules
3. routing logic
4. provider/model guide
5. report format
```

---

# Part 8: Practical recommendations for using these prompts

## Recommendation 1
Use **Claude high thinking** for:
- structure design
- AGENTS.md
- role prompts
- task schema
- routing policy
- validation rules
- retry policy
- autonomy rules

## Recommendation 2
Use **OpenAI low/medium thinking** for:
- formatting outputs
- rewriting documentation
- converting long plans into concise checklists
- polishing reports
- generating simple starter JSON or YAML variants

## Recommendation 3
When a result feels vague, do not just re-prompt casually.

Instead ask:
- what is unclear?
- what is missing?
- what assumption is weak?
- what makes this unsafe?
- what would make this easier to enforce in code?

That makes the prompts more engineering-oriented.

---

# Part 9: Final answer in plain English

Yes, you were right: the next file should be a **prompt-driven build guide**.

And yes, the earlier file did **not** fully specify the appropriate LLM choices and thinking intensity for each role and step.

This file fills that gap by giving you:

- detailed prompts to build the harness
- series prompts for faster iteration
- a role-by-role model routing plan
- a role-by-role thinking mode plan
- a stable order for creating the system

The best practical pattern is:

- **Claude high thinking** for planning, review, validation, recovery, and orchestration
- **Claude medium thinking** for most implementation work
- **OpenAI low/medium thinking** for summaries, docs, lightweight research, and helper tasks
- escalate only when the task genuinely demands it

That gives you a harness that is more likely to work in real life, not just in a showcase video.

---

# Consolidated update: file standards, routing, and implementation decisions

## Concrete routing now preferred
Earlier drafts used abstract labels. The more concrete defaults are:

- **Claude Opus 4.7** for orchestrator, planning, quality, reviewer, validator, recovery
- **Claude Sonnet 4.6** for build lead, frontend, backend, infra
- **GPT-5.4 mini** for research and docs
- allowed override lane: **GPT-5.4**
- optional cheaper Anthropic helper lane: **Claude Haiku 4.5**

## Task handling decision
The harness should use a **tool-driven interaction model** with **file-backed persistence**.

## Pi UI clarification
Prompts alone do not give you a Pi UI. A real Pi UI upgrade would require TypeScript extensions that register widgets, show status, surface blocked actions, and display current role/model/task state.

## Better prompt-writing rule
- prompts should guide behavior
- extensions should enforce behavior

---

# Repo-local structure update

The harness is now reorganized so that:

- `AGENTS.md` and `SYSTEM.md` stay at the repo root
- all other Pi-specific harness assets live under `.pi/agent/`

That means:
- routing docs moved under `.pi/agent/routing/`
- team YAML moved under `.pi/agent/teams/`
- harness docs moved under `.pi/agent/docs/`
- schemas moved under `.pi/agent/state/schemas/`
- runtime-state placeholders moved under `.pi/agent/state/runtime/`

This is the preferred layout when each repo should contain the Pi harness assets it uses.
