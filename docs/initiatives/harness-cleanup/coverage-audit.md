# Harness coverage and reachability audit

**Status:** Tier 0 deliverable. Read-only snapshot.
**Date:** 2026-05-23
**Scope:** `.pi/agent/extensions/*.ts` (48 files), `scripts/*.ts` (33 files), `tests/**/*.ts`.

## Why this exists

The lead's review of the harness raised a concern that some extension paths are not exercised by tests, and the foundation-compile CI script silently skips a hand-picked subset of files. This document is the evidence behind that claim. Findings here feed the Tier 2 consolidation work; nothing is deleted in this audit.

## Method

For each extension `name.ts` in `.pi/agent/extensions/`, count:

- **prod refs** — non-self files under `.pi/agent/extensions/` and `scripts/` that import the file by name
- **test refs** — files under `tests/` that import or reference the file by name

A file with `prod=0, tests=0` is a true orphan. A file with `prod>0, tests=0` is production code with no test coverage.

The reachability matrix below was produced with a grep-based scan; it can miss dynamic `import()` calls or string-built paths, but those patterns are rare in this codebase.

## Findings

### 1. Truly orphaned extensions (0 prod, 0 test references)

| File | Lines | Notes |
|---|---|---|
| `.pi/agent/extensions/auggie-discovery.ts` | 321 | No code references anywhere. One doc mention in `.pi/agent/docs/`. Deletion candidate. |
| `.pi/agent/extensions/second-model-planning.ts` | 380 | Referenced only by `.pi/agent/docs/second_model_planning_contract.md`. No code imports. Deletion candidate. |

**Recommendation:** Verify with the team that these files are dead. If yes, delete in a follow-up PR. Combined ~700 LOC removal.

### 2. Production code with zero test coverage (prod > 0, tests = 0)

| File | Prod refs | Risk |
|---|---|---|
| `g-skill-auto-route.ts` | 1 | Routing — small, but routing bugs are silent failures. |
| `same-runtime-bridge.ts` | 2 | Same-runtime invocation — touched by worker execution. |
| `afk-worker-execution-plan.ts` | 3 | AFK execution planning — central to the unattended-run story. |
| `git-dirty-runtime-artifacts.ts` | 4 | Dirty-repo detection — gates queue/worker runs. |

**Recommendation:** Each of these is reachable from worker-execution or orchestration paths. Either add unit tests in a follow-up Tier 2 PR, or document the runtime fixture that exercises them.

### 3. Extensions skipped by the foundation typecheck

`scripts/check-foundation-extension-compile.sh` (the existing CI typecheck) copies 41 hand-picked extension files into a temp directory and runs `tsc --noEmit` on them. The following 9 files are present in `.pi/agent/extensions/` but **not** in that copy list — so they are not typechecked in CI today:

```
auggie-discovery.ts          (already orphaned — see #1)
doctor.ts                    (added in this Tier 0 stack)
g-skill-auto-route.ts
pr-lifecycle.ts              (551 LOC — central PR-flow code)
same-runtime-bridge.ts
second-model-planning.ts     (already orphaned — see #1)
slice-lifecycle.ts           (373 LOC)
worker-execution.ts          (1167 LOC — central worker code)
worker-same-runtime-execution.ts
```

`worker-execution.ts` and `worker-same-runtime-execution.ts` are particularly notable: they hold the worker-side execution path that the lead's manual `tsc` run found type errors in. The fact that CI skips them is the direct cause of the bugs surviving merge.

**Recommendation:** Tier 0's `tsconfig.json` (PR-002 of this stack) already covers all of them. The follow-on Tier 0 work is to fix the 45 errors that surface, then retire `check-foundation-extension-compile.sh` in favor of the root config.

### 4. Typecheck baseline (running `npm run typecheck` from PR-002)

45 errors across 14 files. Group by file:

| File | Errors | Notes |
|---|---|---|
| `scripts/harness-orchestrate.ts` | 11 | Discriminated-union narrowing failures — orchestrator command dispatch. |
| `tests/extension-units/merge-helper.test.ts` | 11 | Test fixtures don't match current `PrGateCommentSummary`/`SliceLifecycleAssessment` shapes. |
| `tests/extension-units/orchestrator-continue.test.ts` | 5 | Test fixtures don't match current `AfkOrchestrationRun`/`AfkMaterializedQueueJob` shapes. |
| `.pi/agent/extensions/worker-execution.ts` | 4 | Missing `WorkerRunStepStatus` type alias; `callerModelId` accessed but not in input type; two `unknown → string` assignments. |
| `scripts/harness-parallel-worker-lanes.ts` | 3 | `ParallelWorkerLaneManifest` missing required `coordinators` field. |
| `tests/extension-units/worker-execution.test.ts` | 2 | Test passes `callerModelId` field that isn't in the input type. |
| `tests/extension-units/queue-runner.test.ts` | 2 | Test fixture omits required `version: 1` on `TaskState`. |
| `.pi/agent/extensions/queue-runner.ts` | 2 | Accesses `packet.routing.thinking` which isn't on `PacketRoutingSummary`. |
| ...5 more files with 1 error each | 5 | See `npm run typecheck` output. |

The bug-quality of these is mixed. Some are real production type bugs (worker-execution `callerModelId`, queue-runner `thinking`, harness-orchestrate dispatch union). Others are stale test fixtures that should be updated to match current types. None should block fixing in a stacked follow-up PR.

### 5. Duplicated concept clusters worth consolidating (Tier 2 input)

The audit also surfaces shape-similar modules that came in as separate "phase" deliveries and now overlap:

- **Packet generators:** `task-packets.ts` (897 LOC), `frontend-packet-generator.ts` (375), `backend-packet-generator.ts` (377). All model packets with `domain`/`role`/`evidence`/`allowedPaths`. Candidate: one `Packet` module discriminated on `domain`.
- **Recovery:** `recovery-policy.ts` (748) + `recovery-runtime.ts` (677) cross-import each other. Candidate: one `recovery` module with a pure decision function and a side-effecting runtime function.
- **Orchestrator FSM:** `orchestrator-{classifier,dry-run,apply-policy,run,continue,evidence,context}.ts` is one state machine spread across seven files. Candidate: collapse to one module with a discriminated-union state and one `advance()` function.
- **Stitch:** `stitch-prompt-generator.ts`, `stitch-artifact-adapter.ts`, `live-stitch-adapter.ts`, plus the corresponding harness scripts. Candidate: one `stitch` module with adapter/live-adapter as internal strategies.

These are **out of scope for Tier 0** — listed here so the consolidation pass has a starting list.

## Caveats

- The grep-based reachability check can miss imports built from strings or dynamic `import()`. Spot-check before deletion.
- "Zero test coverage" means zero direct test imports; some files may be exercised indirectly through queue-runner integration tests.
- The 45-error baseline is from `npm run typecheck` against the new root `tsconfig.json` (PR-002 of this stack). Fixes will reduce it.

## Next steps

1. Confirm `auggie-discovery.ts` and `second-model-planning.ts` are truly dead. Delete in a focused PR.
2. Tier 0 follow-on stack: fix the 45 typecheck errors in batches grouped by file/concept.
3. Once typecheck is clean, wire `npm run typecheck` into `.github/workflows/ci.yml` and retire `check-foundation-extension-compile.sh`.
4. Tier 2: address the duplicated concept clusters from §5.
