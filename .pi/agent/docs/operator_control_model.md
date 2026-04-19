# Operator Control Model

This document is a short architecture stub for Phase J.
It defines where human control should remain even as the harness becomes more autonomous.

## Purpose
The operator control model exists so the harness feels like a tool, not a research experiment.
It should be clear:
- when the system may proceed automatically
- when human approval is required
- how to inspect state
- how to pause, resume, or stop safely

## Scope
This doc outlines:
- human control points
- pause/resume intent
- inspection intent
- daily operation boundaries
- testing expectations tied to trust

It does not define a UI implementation.

## Core principle
Autonomy should reduce manual prompting, not remove human control.
The operator remains responsible for:
- approving risky actions
- inspecting failures
- deciding ambiguous requirements
- deciding whether to continue after repeated problems

## Human approval points
Human approval should still be required for:
- destructive git history changes
- force-push behavior
- protected-path changes
- auth, secret, or deployment-critical changes
- bypassing safety or task-discipline controls
- large cleanup or rollback actions

This aligns with `AGENTS.md`.

## Minimum operator controls
Phase J should provide at least these control surfaces conceptually:
- start bounded execution
- queue work
- inspect current job/task state
- inspect blockers/failures
- pause execution
- resume execution
- stop safely
- review recent reports and evidence

## Pause / resume model
### Pause
Pause should stop new job pickup.
It should not silently discard current state.

### Resume
Resume should continue from visible queue/task state, not from hidden memory.

### Stop
Stop should leave the system in a reviewable state with:
- current queue/task status preserved
- blockers/failures visible
- partial evidence not discarded

## Inspection model
The operator should be able to answer quickly:
- what job is running now?
- what is blocked?
- what failed recently?
- what evidence exists?
- what still needs approval?
- what changed in the repo?

If those answers are hard to get, the control model is too weak.

## Daily workflow intent
A practical daily workflow should look like:
1. inspect current status
2. queue or approve bounded work
3. let the harness run within limits
4. review blockers/failures/results
5. approve or stop as needed

The operator should not need to reconstruct hidden state from chat history.

## Trust model
Operator trust should come from:
- explicit control points
- visible evidence
- reliable validation
- end-to-end tests for core flows
- clear stop conditions

Trust should not come from hype or from the system sounding confident.

## Success definition
Phase J is successful when a human can operate the harness predictably with low overhead while keeping control over risky decisions.
