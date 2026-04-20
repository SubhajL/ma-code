# Same-Runtime Bridge Architecture

This document defines the bounded architecture for the same-runtime probe bridge.

## Purpose
The same-runtime bridge exists to solve one specific problem:
- standalone `pi` subprocess probes resolve auth separately from the parent runtime
- this can drift from the model/account path the parent harness runtime is using

The bridge makes bounded live probes run through the same **controlled parent Pi runtime context** instead of a separate CLI auth path.

## What it means by "same runtime"
In this repo, "same runtime" means:
- reuse the parent runtime's selected model by default
- reuse the parent runtime's shared `ModelRegistry`
- reuse the parent runtime's shared `AuthStorage`
- avoid standalone `pi` subprocess auth resolution for the child probe itself

## What it does NOT guarantee
This bridge does **not** guarantee reuse of:
- an outer hidden session token from a host platform we do not control
- a provider account/session that is not exposed through the parent runtime's `ModelRegistry` and `AuthStorage`

So the precise guarantee is:

> same model/account path as the parent harness runtime we control

not:

> guaranteed reuse of any opaque outer chat session token

## Current executable surface
The current repo-local executable same-runtime bridge lives at:
- `.pi/agent/extensions/same-runtime-bridge.ts`
- tool: `run_same_runtime_probe`
- validator: `scripts/validate-same-runtime-bridge.sh`

## Current bounded behavior
The current bounded bridge:
- spawns a child SDK `AgentSession`
- uses the parent runtime's shared `modelRegistry`
- uses the parent runtime's shared `authStorage`
- defaults to the parent-selected model
- supports a bounded provider/model override if that model exists in the shared registry
- returns provider/model/auth-source metadata for inspection

## Current bounded non-goals
The current bridge does not yet implement:
- queue-driven worker orchestration
- multi-worker dispatch
- custom provider aliasing for all worker lanes
- guaranteed outer-session token reuse

## Why the SDK child-session approach is preferred
This is preferred over standalone `pi` because it:
- keeps auth/model resolution in-process
- lets probes inherit the current model by default
- gives later multi-agent harness code a reusable sub-agent foundation
- avoids guessing which account a separate CLI subprocess used

## Why a provider alias is not the first slice
A provider alias can be useful later, but it is not the core mechanism.
The core mechanism is:
- a shared runtime bridge using shared registry/auth objects

If that foundation does not exist, a provider alias alone cannot guarantee same-runtime reuse.

## Future expansion path
If later needed, this bridge can support:
- worker spawning for the multi-agent harness
- provider-style aliasing on top of the same bridge
- stronger metadata about auth source class and runtime provenance

Those should extend the same-runtime bridge additively rather than replacing it.
