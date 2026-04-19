# Detailed Build Plan for a Pi-Based Multi-Agent Coding System on macOS

## What this document is

This is a **plain-English build plan** for creating a **single-machine, production-grade multi-agent coding system** on your Mac using **Pi** as the main framework, with **Claude** and **OpenAI** as the model providers.

This plan is based on the ideas shown in the two videos you shared, but it is written in a more practical and stable way. The goal is not just to make something that looks impressive on a video. The goal is to build something that you can actually use, trust, maintain, and improve over time.

---

# Part 1: The big idea in simple terms

Imagine you are building a small company inside your laptop.

Instead of having one AI assistant trying to do everything, you create a **team**:

- one **manager** that receives your goal
- a few **team leads** that break the work down
- a few **specialists** that actually do the work
- one **quality checker** that reviews everything before it is accepted
- one **documenter** that writes down what happened

This is the core idea behind the multi-agent setup in the videos.

In plain terms:

- **One agent thinks about the whole mission**
- **Other agents focus on smaller jobs**
- **Each agent has a specific responsibility**
- **The system keeps track of progress**
- **Nothing is considered finished until it is checked**

That is what makes the setup more powerful than just chatting with one coding model in a terminal.

---

# Part 2: What Pi is doing in this setup

Pi is the **engine room** and **control center**.

Think of Pi as the shell that lets you build your own custom AI coding tool instead of being forced to use someone else's fixed version.

Pi gives you the ability to control things like:

- which model is used
- how agents behave
- what prompts they start with
- what tools they can use
- what happens when they fail
- how they show status
- how they remember things
- how multiple agents talk to each other

So if Claude Code is like renting a luxury car with limited customization, Pi is like buying a custom workshop where you can build the vehicle exactly the way you want.

That freedom is why Pi is a strong choice for a system like the one in the videos.

---

# Part 3: What you are building, in plain English

You are not building "magic AI."

You are building a **structured work system**.

Here is what the finished system should be able to do:

1. You give it a goal
2. The main agent understands the goal
3. It breaks the goal into smaller tasks
4. It sends those tasks to the right specialized agents
5. Those agents work in parallel when possible
6. Their work gets reviewed and validated
7. A report is created
8. The next goal can begin

A good way to think about this is:

- **The orchestrator** is the project manager
- **The leads** are engineering managers
- **The workers** are specialists
- **The validator** is QA
- **The documenter** is the person who writes the handoff notes

---

# Part 4: What you need before you start

You said your target is:

- **macOS**
- **single machine**
- **production-grade**
- **Pi / Pi Agent**
- **Claude and OpenAI**
- **autonomous long-running workflows**
- **exact recreation where practical**

So the build plan below assumes that.

## Software you need

Install these first:

- Homebrew
- Node.js 20 or newer
- npm
- Git
- tmux
- Pi coding agent
- API keys for Anthropic and OpenAI
- optionally Docker

## Why these matter

### Homebrew
This helps install tools easily on macOS.

### Node.js and npm
Pi is installed through npm, so you need the JavaScript runtime.

### Git
Your agents will be editing files. Git is your safety net.

### tmux
This lets you run multiple terminal sessions at once. Very useful when you want separate lanes for orchestrator, builders, reviewers, and logs.

### Pi
This is the main framework.

### API keys
Your agents need access to the models.

### Docker
Not strictly required, but very helpful if you want isolated services, test environments, or safer execution.

---

# Part 5: Install everything step by step

## Step 1: Install system tools

Open Terminal and run:

```bash
brew install node git tmux
```

This installs the basic tools you need.

## Step 2: Install Pi

```bash
npm install -g @mariozechner/pi-coding-agent
```

This installs Pi globally so you can run it from anywhere.

## Step 3: Set API keys

Add your keys to your shell profile. For zsh, this is usually `~/.zshrc`.

Example:

```bash
export ANTHROPIC_API_KEY="your_anthropic_key_here"
export OPENAI_API_KEY="your_openai_key_here"
```

Then reload your shell:

```bash
source ~/.zshrc
```

## Step 4: Confirm Pi runs

Run:

```bash
pi
```

If Pi launches, you are ready for the next stage.

---

# Part 6: Create the workspace

Now you will build the folder structure for your multi-agent system.

Create a dedicated folder for the harness itself.

Example:

```bash
mkdir -p ~/agent-harness
cd ~/agent-harness
git init
```

Now create the internal structure:

```bash
mkdir -p .pi/agent/{skills,prompts,themes,extensions,packages,teams}
mkdir -p state/{orchestrator,planner,research,frontend,backend,infra,reviewer,validator,docs,recovery}
mkdir -p logs plans reports scripts templates worktrees
```

## What these folders do

### `.pi/agent/`
This is where your Pi-specific configuration lives.

### `skills/`
Reusable instructions for agents.

### `prompts/`
Role-specific system prompts.

### `extensions/`
Custom code that changes Pi’s behavior.

### `teams/`
Definitions of who belongs to which team.

### `state/`
Persistent memory for each agent role.

### `logs/`
Records of runs, failures, summaries, and activity.

### `plans/`
Task plans created by the orchestrator and planning lead.

### `reports/`
Final outputs and handoff notes.

### `worktrees/`
Separate Git workspaces so agents can work safely without stepping on each other.

---

# Part 7: Build the agent team in simple terms

Do not start with too many agents.

The videos show a lot of specialized roles, but for a stable first version, start with a smaller team.

## The first team you should build

### 1. Orchestrator
This is the main manager.

Its job:
- understand your request
- decide what team should do it
- break big jobs into smaller jobs
- route tasks
- decide when a task is done
- decide when to retry or escalate

Important: the orchestrator should **not** be writing lots of code directly.

### 2. Planning Lead
This agent turns goals into plans.

Its job:
- break a goal into tasks
- define acceptance criteria
- decide task order
- estimate dependencies

### 3. Build Lead
This agent coordinates implementation.

Its job:
- decide which worker should do what
- make sure two workers do not collide
- collect progress from workers
- escalate if someone gets stuck

### 4. Quality Lead
This agent protects quality.

Its job:
- review what was built
- trigger validation
- check if requirements were truly met
- send things back for fixes if needed

### 5. Research Worker
This agent explores the repo and documentation.

Its job:
- find relevant files
- summarize code areas
- gather background context
- locate existing patterns

### 6. Frontend Worker
This agent only touches frontend code.

Its job:
- build UI
- update components
- connect UI to API contracts
- adjust styling where allowed

### 7. Backend Worker
This agent only touches backend code.

Its job:
- build endpoints
- add business logic
- adjust services
- update tests where appropriate

### 8. Infra Worker
This agent handles environment and automation pieces.

Its job:
- scripts
- config
- CI
- Docker
- env templates

### 9. Reviewer Worker
This agent reads code changes critically.

Its job:
- review diffs
- find risks
- point out broken assumptions
- catch style or architecture drift

### 10. Validator Worker
This agent checks whether the work actually works.

Its job:
- run tests
- run linting
- run smoke checks
- compare outputs with the task requirements

### 11. Docs Worker
This agent writes the summary of what was done.

Its job:
- update changelog
- explain the changes
- list files touched
- note anything unfinished

### 12. Recovery Worker
This agent handles breakdowns.

Its job:
- investigate failures
- suggest rollback or retry
- decide whether to switch model or strategy

---

# Part 8: Why specialization matters

This is one of the biggest ideas from the videos.

A general-purpose agent can do many things badly.

A specialized agent can do one thing better.

For example:

- A frontend worker should not be editing deployment scripts
- A backend worker should not be deciding UI design
- A validator should not be writing feature code
- A reviewer should not be the main planner

This matters because it reduces confusion and increases consistency.

It also makes debugging easier. If something goes wrong, you can tell which role failed.

---

# Part 9: How work should flow through the system

Here is the ideal workflow in normal language.

## Step 1: You give the system a goal

For example:

> Add CSV export and filtering to the admin dashboard.

## Step 2: The orchestrator reads the goal

It asks:
- what kind of problem is this?
- which teams are needed?
- what risks are involved?
- can parts of this run in parallel?

## Step 3: The planning lead creates a plan

The planning lead turns the goal into a checklist.

Example:
- inspect current dashboard code
- inspect backend endpoint support
- define export requirements
- implement UI filter controls
- add API parameter support
- add export handler
- update tests
- validate behavior
- produce report

## Step 4: The build lead dispatches workers

The build lead sends tasks like:
- frontend worker: add filter UI
- backend worker: add export endpoint support
- infra worker: update any scripts if needed

## Step 5: Workers do the actual coding

Each worker works inside its own scope and ideally its own worktree.

## Step 6: The quality lead reviews outputs

It asks:
- were the requirements met?
- were tests updated?
- did any worker break something else?

## Step 7: Validator runs checks

The validator should not trust what workers say.

It checks:
- test results
- lint
- build status
- acceptance criteria
- manual smoke checks where needed

## Step 8: Docs worker creates a report

This includes:
- summary of work
- files changed
- tests run
- risks
- next steps

## Step 9: Orchestrator marks the run complete

Only after evidence exists.

---

# Part 10: Use worktrees so agents do not fight each other

One of the easiest ways multi-agent systems become messy is when multiple agents edit the same working directory.

That is why you should use **Git worktrees**.

## What a worktree is

A worktree is like a second checkout of the same repo, but on a different branch.

This lets different agents work separately.

## Why this helps

Without worktrees:
- agents overwrite each other
- diffs get tangled
- testing becomes confusing
- rollback becomes painful

With worktrees:
- each agent has its own branch
- each change is isolated
- review is cleaner
- merging is safer

## Example structure

```text
worktrees/
  frontend-feature-csv/
  backend-feature-csv/
  validator-run/
```

This makes the system much more stable.

---

# Part 11: The most important feature to build early: the “till-done” system

This is one of the best ideas from the second video.

## What it means in plain English

Before an agent starts making changes, it must say:

- what task it is doing
- what counts as success
- what evidence it will provide

Then it does the work.

Then it must prove the work is complete.

If it cannot prove it, the task stays open.

## Why this matters

Without this, agents often:
- wander
- forget the goal
- stop halfway
- declare victory too early

With a till-done system:
- tasks stay visible
- progress is traceable
- failures are obvious
- weaker models become more reliable

## Simple example

Task:
- Add filter controls to admin dashboard

Acceptance criteria:
- filter component appears
- values update query params
- backend accepts params
- tests pass

Evidence:
- changed files
- screenshots or textual summary
- test results

Status flow:
- queued
- in_progress
- review
- done
- blocked

---

# Part 12: Build the system in phases

Do not try to build everything at once.

## Phase 1: Stable foundation

In this phase, your goal is not “wow.”  
Your goal is “works reliably.”

Build:
- Pi installation
- API access
- folder structure
- AGENTS.md
- role prompts
- task file persistence
- worktree policy
- orchestrator
- planning lead
- one build lead
- frontend worker
- backend worker
- reviewer
- validator
- docs worker

At the end of this phase, you should be able to complete one normal feature request safely.

## Phase 2: Better control and visibility

Now add:
- custom footer
- branch display
- model display
- task widget
- cost or token display
- clearer logging
- run reports

This gives you better visibility into what the system is doing.

## Phase 3: Real orchestration

Now add:
- multiple workers per team
- parallel dispatch
- retry logic
- fallback model switching
- quality lead
- recovery worker
- scoped domain rules

At this stage, the system starts to feel much closer to the videos.

## Phase 4: Long-running autonomy

Now add:
- job queues
- scheduled runs
- background processes
- auto-retry with limits
- stop conditions
- daily reports
- unresolved issue rollups

This is the stage where your system becomes capable of sustained autonomous work.

## Phase 5: Exact-video style improvements

Only after everything else is stable:
- theme cycling
- fancy widgets
- meta-agent that creates agents
- more specialized leads
- more specialized validators
- browser role
- memory / expertise files per role

These are useful, but they should come after stability.

---

# Part 13: How memory should work

One of the videos talks about agents “remembering” and keeping mental models.

Do not rely only on chat history for this.

Instead, create state files for each role.

## Example

```text
state/frontend/
  current_focus.md
  known_patterns.md
  recent_failures.md
```

This is much better than hoping the model remembers things across long sessions.

## Why this helps

It lets the system keep track of:
- repeated repo patterns
- project conventions
- role-specific notes
- common pitfalls
- unfinished work

This creates the practical version of “agent memory.”

---

# Part 14: How to choose which model does what

Do not use your strongest model for everything.

That gets expensive and inefficient.

## Claude should do:
- architecture
- planning
- repo-wide reasoning
- hard coding
- code review
- difficult validation analysis

## OpenAI should do:
- summaries
- file classification
- lightweight docs
- repetitive cleanup
- basic transformations
- helper tasks

## Why this is smart

This gives you:
- better cost control
- better speed
- a useful fallback when one provider struggles
- more flexible orchestration

A good system does not just ask “which model is best?”

It asks:
- which model is best for *this task*?

---

# Part 15: Safety rules you should treat as mandatory

The videos lean a bit too heavily into a “YOLO” mindset.

For a real production setup, you need stronger rules.

## Mandatory rules

- Never let agents edit `main` directly
- Always use branches or worktrees
- Block dangerous shell commands
- Block secret and env files by default
- Require checkpoints before large edits
- Require review before merge-ready state
- Require validation before task completion
- Limit retries
- Limit maximum cost per run
- Limit maximum file count changed in one task
- Stop if acceptance criteria are unclear

These rules make the system slower than a hype demo, but much safer and more useful.

---

# Part 16: What long-running autonomy should really mean

You said you want autonomous long-running behavior.

The wrong way:
- one giant always-on agent with unclear limits

The right way:
- a queue of small jobs
- each job has a scope
- each job has a budget
- each job has a stop condition
- each job produces a report

## Example jobs

- inspect codebase and propose refactors
- build one small feature
- review open diffs
- update docs
- clean up tests
- prepare release notes

This is how you get “autonomy” without getting chaos.

---

# Part 17: The job queue in plain language

Think of the queue like a list of assignments.

Example:

- Job 1: Add dashboard CSV export
- Job 2: Review previous branch
- Job 3: Update API docs
- Job 4: Investigate failed test suite

The orchestrator should pick the next job, assign it, and wait for evidence before marking it done.

This is much more realistic than trying to build one magical agent that does everything forever.

---

# Part 18: What the orchestrator should and should not do

## The orchestrator should:
- understand goals
- assign work
- track status
- collect summaries
- route retries
- stop bad workflows
- escalate uncertain situations

## The orchestrator should not:
- become the main coder
- manually rewrite everything itself
- ignore validation
- let workers overlap carelessly
- keep retrying forever without learning

This is important because one of the failure modes in the first video is that higher-level agents start doing work they were not meant to do when things break. That can happen, but it should be a controlled exception, not the default.

---

# Part 19: What “exact recreation” really means here

You asked for an exact recreation where possible.

Here is the honest version:

## You can recreate:
- the three-tier architecture
- the Pi-based control structure
- the role specialization
- the till-done behavior
- the team dispatch style
- the model mixing
- the memory file approach
- the multi-terminal workflow
- the long-running automation approach

## You probably cannot recreate exactly:
- the creator’s private prompts
- member-only assets
- hidden codebases
- his exact extension code unless published
- his exact UI demos pixel-for-pixel

So the real target should be:
- **exact in architecture**
- **close in behavior**
- **better in stability**

That is the right engineering goal.

---

# Part 20: What your final system should feel like

When this is working well, the experience should feel like this:

You type one high-level goal.

The system responds with:
- a plan
- assigned teams
- tasks in progress
- logs
- results
- validation
- a final summary

You should feel like you are supervising a small engineering org, not babysitting one confused chatbot.

That is the right mental model.

---

# Part 21: Recommended build order in one simple checklist

## Stage 1
- install tools
- install Pi
- connect Claude and OpenAI
- create repo
- create folder structure

## Stage 2
- write AGENTS.md
- define roles
- write role prompts
- create simple team files

## Stage 3
- create orchestrator
- create planner
- create one builder
- create reviewer
- create validator
- create docs worker

## Stage 4
- add till-done task tracking
- add task files
- add logging
- add reports

## Stage 5
- add worktrees
- isolate workers
- add safety blocking
- add checkpoints

## Stage 6
- add multiple worker types
- add model routing
- add retry/fallback logic
- add recovery role

## Stage 7
- add job queue
- add long-running background flows
- add daily summaries and maintenance workflows

## Stage 8
- add fancy UX features
- add widgets
- add footer/status customization
- add theme switching
- add meta-agent support

---

# Part 22: Final recommendation in plain English

If you want the shortest truthful answer:

Build this system like a careful engineering platform, not like a flashy demo.

Start small.
Make the roles clear.
Force agents to track tasks.
Use worktrees.
Validate everything.
Let Claude handle the harder thinking.
Let OpenAI handle lighter helper work.
Grow the system only after the foundation is stable.

That is the best way to recreate the value of the videos while avoiding their weakest parts.

---

# Part 23: Suggested next document after this one

After this build plan, the next useful file to create is:

**`pi-multi-agent-implementation-checklist.md`**

That file should include:
- exact file/folder creation commands
- sample AGENTS.md
- sample team YAML
- sample prompt files
- sample task schema
- sample runbook for daily use

That would turn this plan into an actual implementation guide.


---

# Consolidated update: what has changed since the first draft

## Pi UI status
Pi UI is **planned but not yet implemented** in the starter pack. What exists now is the policy/control foundation:
- role prompts
- task and queue schemas
- extension specs
- routing defaults
- team definitions

What does **not** exist yet:
- live status/footer widget
- task panel widget
- queue/job panel
- blocked-action UI notices
- keyboard bindings
- actual TypeScript UI extension code

## Final task-handling decision
For this harness, the recommended design is:

- **interaction layer:** tool-driven
- **persistence layer:** file-backed

Agents should not directly edit raw task JSON as the normal path. They should call a task tool such as `task_update`, and that tool should write to JSON state on disk.

## File type policy
Use file types like this:
- **`.ts`** for runtime logic and Pi extensions
- **`.md`** for prompts, role files, policies, skills, and specs
- **`.json`** for machine-readable state and strict configuration
- **`.yaml`** for human-friendly harness configuration like team definitions

## Concrete default model routing
- orchestrator → Claude Opus 4.7, high
- planning_lead → Claude Opus 4.7, high
- build_lead → Claude Sonnet 4.6, medium
- quality_lead → Claude Opus 4.7, high
- research_worker → GPT-5.4 mini, low
- frontend_worker → Claude Sonnet 4.6, medium
- backend_worker → Claude Sonnet 4.6, medium
- infra_worker → Claude Sonnet 4.6, high
- reviewer_worker → Claude Opus 4.7, high
- validator_worker → Claude Opus 4.7, high
- docs_worker → GPT-5.4 mini, low
- recovery_worker → Claude Opus 4.7, high

## Copilot compatibility conclusion
The current routing matrix was chosen so it can also be used through GitHub Copilot in Pi, subject to your exact runtime exposing those models.

## Next implementation priorities
The strongest next code upgrades are still:
1. `safe-bash.ts`
2. `till-done.ts`

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
