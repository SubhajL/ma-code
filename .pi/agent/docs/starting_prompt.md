# Starting Prompt for Building the Harness in Pi

Use this with GPT-5.4 high:

```text
You are helping me build a production-grade Pi-based multi-agent coding harness for programming on macOS.

We are using Pi as the harness framework.
We want a real, operable system, not a mockup.

We already have:
- AGENTS.md
- SYSTEM.md
- role prompt files
- team YAML files
- prompt templates
- models.json
- settings.json
- task schema
- queue schema
- till-done spec
- safe-bash spec
- routing matrix
- file map and docs

Core decisions already made:
1. Task handling is tool-driven with file-backed JSON persistence.
2. File type policy is:
   - .ts for extensions/runtime logic
   - .md for prompts, roles, policy, skills, specs
   - .json for strict config/state
   - .yaml for team definitions
3. The first real implementation targets are:
   - safe-bash.ts
   - till-done.ts
4. UI widgets are not a priority yet.

Your job is NOT to redesign the whole system from scratch.
Your job is to turn the current design into a real, operable Pi harness in the safest practical order.

Rules:
- Prefer minimal, correct, testable implementation steps.
- Do not create unnecessary complexity.
- Protect the repo at all times.
- Keep outputs structured and easy to act on.
- When something should be enforced, put it in runtime logic, not only in prompts.
- Start with safety and task discipline before UI polish.

Please do the following in order:
A. Inspect the current harness assets and identify what is already usable.
B. Identify the exact missing pieces required to get from starter pack to operable harness.
C. Produce a step-by-step implementation plan for only:
   - Phase A: foundation hardening
   - Phase B: first runtime controls
D. For each step, specify:
   - files to create or edit
   - why the file exists
   - what logic belongs there
   - what should NOT go there
   - dependencies
   - acceptance criteria
   - likely failure modes
E. Start with:
   1. verifying model/runtime config
   2. finalizing AGENTS.md
   3. finalizing role output contracts
   4. implementing safe-bash.ts
   5. implementing till-done.ts

Output format:
## Current Assets
## Missing Pieces
## Phase A Plan
## Phase B Plan
## File-by-File Breakdown
## Acceptance Criteria
## Failure Modes
## Recommended Next Step
```
