# /new session model persistence plan

## Goal
Fix `/new` so scoped models, selected model, and thinking level survive session replacement.

## Discovery
- `g-coding` loaded.
- Auggie discovery attempted first and failed due credit exhaustion; using local file/source inspection fallback.
- Current repo does not contain Pi core source; `/new` lives in installed `@mariozechner/pi-coding-agent` under Homebrew (`dist/modes/interactive/interactive-mode.js`) and runtime replacement in `dist/core/agent-session-runtime.js`.

## TDD tracer bullet
- Public behavior: calling runtime `newSession` from a session with non-default model, thinking level, and scoped models must pass those values into the replacement runtime.
- RED: create a focused unit test around `AgentSessionRuntime.newSession` using fake sessions and a fake runtime factory.
- GREEN: minimally add preservation options to runtime replacement and have `/new` pass the current session state.

## Acceptance mapping
- Preserve scoped models: replacement runtime receives copied `scopedModels`.
- Preserve selected model: replacement runtime receives current `model`.
- Preserve thinking level: replacement runtime receives current `thinkingLevel`.
- Regression coverage: focused test fails before implementation and passes after.
- Validation: focused test, syntax/type sanity where practical, diff check, and g-check-style review.
