# /new session model persistence coding log

## 2026-05-03 Initial discovery and plan

### Goal
- Fix `/new` so scoped models, selected model, and thinking level persist into the replacement session.

### Discovery path
- Loaded `g-coding` workflow.
- Read `AGENTS.md`, `README.md`, and `logs/CURRENT.md`.
- Created active task `task-1777779980801` with acceptance criteria before mutation.
- Created isolated worktree `/Users/subhajlimanond/dev/ma-code-worktrees/session-new-persistence` on branch `split/session-new-persistence`.
- Attempted Auggie discovery first; it failed with credit exhaustion and recommended local fallback.
- Local source inspection found `/new` in installed Pi package:
  - `/opt/homebrew/Cellar/pi-coding-agent/0.70.5/libexec/lib/node_modules/@mariozechner/pi-coding-agent/dist/modes/interactive/interactive-mode.js`
  - runtime replacement in `/opt/homebrew/Cellar/pi-coding-agent/0.70.5/libexec/lib/node_modules/@mariozechner/pi-coding-agent/dist/core/agent-session-runtime.js`
  - session creation/model resolution in `dist/main.js`, `dist/core/sdk.js`, and `dist/core/agent-session.js`.

### TDD plan
- Add a focused regression test proving `newSession()` loses current `model`, `thinkingLevel`, and `scopedModels` because replacement runtime creation receives no preservation overrides.
- Implement the smallest runtime/UI change to pass current session state into replacement runtime creation for `/new`.

### Current risks
- The current ma-code repo does not vendor Pi core source; the actual `/new` implementation is in the installed Pi package. Need keep changes bounded and clearly record whether the final patch is repo-local, upstream/source, or installed-runtime-only.

## 2026-05-03 TDD implementation and validation

### Files changed and why
- Added `.pi/agent/extensions/new-session-persistence.ts` to install a repo-local runtime patch for `AgentSessionRuntime.newSession`.
  - Captures the current selected model, thinking level, and scoped model list before session replacement.
  - Restores scoped models, selected model, and thinking level in the replacement session via a wrapped `withSession` callback.
  - Guards against double patching.
- Added `tests/integration/pi-new-session-persistence.test.mjs` as focused regression coverage around runtime replacement behavior.
- Added `test:new-session-persistence` npm script.
- Added the new extension to `scripts/check-foundation-extension-compile.sh`.
- Updated `README.md`, `.pi/agent/docs/file_map.md`, `logs/CURRENT.md`, and planning/coding logs for discoverability/evidence.

### RED evidence
- Command: `node --test tests/integration/pi-new-session-persistence.test.mjs`
- Failure: `AssertionError`: replacement runtime did not receive/preserve the selected model; actual `undefined`, expected `{ provider: 'provider-a', id: 'model-selected', reasoning: true }`.
- Interpretation: baseline `/new` replacement path did not carry current model state forward.

### GREEN evidence
- Command: `tsx --test tests/integration/pi-new-session-persistence.test.mjs`
- Result: PASS; focused test observed restored scoped models, selected model, and thinking level on the replacement session.
- Command: `npm run test:new-session-persistence`
- Result: PASS.
- Flake check: ran `npm run test:new-session-persistence` 3 consecutive times; all 3 passed.

### Other validation
- `bash scripts/check-foundation-extension-compile.sh` -> `foundation-extension-compile-ok`.
- `printf '{"id":1,"type":"get_commands"}\n' | pi --mode rpc --no-session | head -40` -> RPC command discovery succeeded with project extensions loaded, indicating no startup/load failure from the new extension.
- `bash scripts/check-repo-static.sh` -> `prompt-contract-validation: PASS (29 prompt files checked)` and `repo-static-checks-ok`.
- `git diff --check` -> no output.

### Wiring verification
- `.pi/settings.json` already loads `agent/extensions`, so `.pi/agent/extensions/new-session-persistence.ts` is loaded as a project extension without additional settings wiring.
- Compile validator now copies and typechecks `new-session-persistence.ts` with the other foundation extensions.
- RPC startup check loads the project extension set successfully.

### Behavior change
- `/new` now preserves session-local model controls in this repo-local harness runtime: scoped model list, current selected model, and current thinking level.

### Risks / known gaps
- This is implemented as a repo-local compatibility patch against Pi's exported `AgentSessionRuntime` rather than an upstream Pi core change because direct mutation of the installed Homebrew package was blocked by runtime safety controls and the current repo does not vendor Pi core source.
- The regression test uses the locally installed Pi package path when present and skips if that package is absent; compile/static checks provide portable CI coverage for the extension itself.

## Review (2026-05-03) - working-tree

### Reviewed
- Repo: `/Users/subhajlimanond/dev/ma-code-worktrees/session-new-persistence`
- Branch: `split/session-new-persistence`
- Scope: working-tree
- Commands Run:
  - `git status --short`
  - `git diff -- .pi/agent/extensions/new-session-persistence.ts tests/integration/pi-new-session-persistence.test.mjs scripts/check-foundation-extension-compile.sh package.json README.md .pi/agent/docs/file_map.md logs/CURRENT.md`
  - targeted reads of `.pi/agent/extensions/new-session-persistence.ts` and `tests/integration/pi-new-session-persistence.test.mjs`

### Findings
CRITICAL
- none

HIGH
- none

MEDIUM
- none

LOW
- none

### Open Questions / Assumptions
- Assumes Pi continues to export `AgentSessionRuntime` from `@mariozechner/pi-coding-agent`; compile coverage checks this against the current project dependency contract.
- Assumes preserving model controls for all `newSession()` calls is acceptable; callers with `withSession` can still override after the preservation runs.

### Recommended Tests / Validation
- Keep focused `test:new-session-persistence` as the primary regression test.
- Keep foundation extension compile and RPC startup checks because this is a repo-local runtime patch loaded as a project extension.

### Rollout Notes
- The change is repo-local and loaded through existing `.pi/settings.json` extension-directory wiring.
- If upstream Pi later fixes `/new` natively, this extension can be removed after confirming equivalent behavior.
