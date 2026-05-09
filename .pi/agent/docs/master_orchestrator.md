# Master Orchestrator — Phase 4

## Scope
- Phase 1 is a read-only deterministic classifier.
- Phase 2 is a delegated dry-run planner.
- Phase 3 is a bounded apply/materialize router.
- Phase 4 adds a bounded foreground `run` session that delegates exactly one execution lane and then stops with visible evidence.
- It maps a human goal or explicit path to one known harness path, executes exactly one allowlisted helper, and normalizes the helper response into one operator-readable plan/result.
- It does not create hidden daemons, bypass HITL gates, merge, sync main, run raw git, or directly mutate protected runtime JSON.

## Commands
```bash
npm run harness:orchestrate -- classify --goal "Build checkout mini flow" --json
npm run harness:orchestrate -- dry-run --goal "Build checkout flow for shoppers to place orders and complete payments so the team can validate order confirmation acceptance" --json
npm run harness:orchestrate -- apply --path stitch_prompt --initiative checkout --slice slice-001 --json
npm run harness:orchestrate -- run --initiative greenfield-scaffold --max-steps 3 --max-runtime-seconds 300 --json
npm run harness:orchestrate -- run --initiative greenfield-scaffold --job-id afk-greenfield-scaffold-issue-001 --max-steps 3 --max-runtime-seconds 300 --allow-pr-create --approval-ref human-123 --json
npm run harness:orchestrate -- run --lane parallel_lanes --initiative greenfield-scaffold --max-steps 3 --max-runtime-seconds 300 --max-parallel 2 --worker-command "npm test -- --runInBand" --json
npm run harness:operator -- orchestrate classify --goal "Build checkout mini flow" --json
npm run harness:operator -- orchestrate dry-run --goal "Build checkout flow for shoppers to place orders and complete payments so the team can validate order confirmation acceptance" --json
npm run harness:operator -- orchestrate apply --path screen_approval --action approve --initiative checkout --slice slice-001 --approval-ref human-123 --by reviewer --note "Approved" --json
npm run harness:operator -- orchestrate run --initiative greenfield-scaffold --max-steps 3 --max-runtime-seconds 300 --json
```

## Selected Paths and Run Lanes
- Phase 2 dry-run paths: `product_feature`, `ui_slice`, `issue_materialization`, `product_pipeline`, `afk_queue`, `worker_job`, `pr_lifecycle`, `merge`, `status`, `clarification`.
- Phase 3 apply paths: `product_intake`, `issue_materialization`, `product_pipeline`, `stitch_prompt`, `stitch_artifact`, `screen_approval`, `slice_contract`, `frontend_packet`, `backend_packet`, `afk_queue_materialization`.
- Phase 4 run lanes: `queue_level`, `worker_job`, and `parallel_lanes`.

## Normalized Dry-run Shape
The dry-run planner emits JSON shaped for operators:

```json
{
  "version": 1,
  "mode": "dry_run",
  "selectedPath": "product_pipeline",
  "confidence": "high",
  "delegatedCommand": "npm run harness:product-pipeline -- dry-run --initiative greenfield-scaffold --json",
  "status": "ready",
  "writesFiles": false,
  "requiredArtifacts": [],
  "missingArtifacts": [],
  "hitlGates": [],
  "blockers": [],
  "helperSummary": {},
  "rawOutputExcerpt": "",
  "nextSafeActions": []
}
```

## Normalized Apply Shape
The apply router emits runtime JSON only:

```json
{
  "version": 1,
  "mode": "apply",
  "selectedPath": "screen_approval",
  "delegatedCommand": "npm run harness:screen-approval -- approve --initiative checkout --slice slice-001 --by reviewer --note Approved --json",
  "status": "materialized",
  "approvalRef": "human-123",
  "createdFiles": ["docs/initiatives/checkout/screen-artifacts/slice-001.approval.json"],
  "allowedWritePaths": ["docs/initiatives/checkout/screen-artifacts/slice-001.approval.json"],
  "blockers": [],
  "nextSafeActions": ["Run harness:slice-contract dry-run/apply only after approval is accepted."]
}
```

## Normalized Run Shape
Phase 4 `run` emits runtime JSON that records the selected lane, delegated command, bounded limits, blockers, work evidence, PR boundary, and merge boundary:

```json
{
  "version": 1,
  "mode": "run",
  "selectedLane": "worker_job",
  "delegatedCommand": "npm run harness:worker-execute -- run --initiative greenfield-scaffold --job-id afk-greenfield-scaffold-issue-001 --max-steps 3 --max-runtime-seconds 300 --stop-before-pr --allow-pr-create --approval-ref human-123 --json",
  "status": "stopped",
  "limits": { "maxSteps": 3, "maxRuntimeSeconds": 300, "maxParallel": 1 },
  "startedWork": [],
  "completedWork": ["afk-greenfield-scaffold-issue-001"],
  "blockers": [],
  "stopReason": "approval_boundary",
  "pr": { "created": false, "url": null, "gateStatus": null },
  "merge": { "attempted": false, "allowed": false, "reason": "Phase 4 stops before merge by default" },
  "nextSafeActions": []
}
```

The text contract for operators is `merge.attempted: false`: Phase 4 never merges by default.

## Delegation Allowlist
Phase 2 delegates only read-only helper forms:
- `harness:product-intake -- --slug <slug> --description <desc> --dry-run --json`
- `harness:issue-materialize -- dry-run --source <path> --json`
- `harness:product-pipeline -- dry-run --initiative <slug> --json`
- `harness:afk-orchestrate -- dry-run --initiative <slug> --json`
- `harness:worker-execute -- dry-run --initiative <slug> --job-id <id> --json`
- `harness:pr-lifecycle -- dry-run --initiative <slug> --worker-run-id <id> --json`
- `harness:merge -- check --pr <number> --json`
- `harness:operator -- status --json`

Phase 3 delegates only bounded materialization helper forms:
- `harness:product-intake -- --slug <slug> --description <desc> --apply --json`
- `harness:issue-materialize -- apply --source <path> --json`
- `harness:product-pipeline -- apply --initiative <slug> --json`
- `harness:stitch-prompt -- --initiative <slug> --slice <slice> --apply --json`
- `harness:stitch-artifact -- --initiative <slug> --slice <slice> --apply --json`
- `harness:screen-approval -- approve|reject --initiative <slug> --slice <slice> --by <reviewer> --note|--reason <text> --json`
- `harness:slice-contract -- --initiative <slug> --slice <slice> --apply --json`
- `harness:fe-packet -- --initiative <slug> --slice <slice> --apply --json`
- `harness:be-packet -- --initiative <slug> --slice <slice> --apply --json`
- `harness:afk-orchestrate -- apply --queue-only --initiative <slug> --json`

Phase 4 delegates only bounded foreground execution helper forms:
- `harness:afk-orchestrate -- run --run --initiative <slug> --max-steps <n> --max-runtime-seconds <n> --json`
- `harness:worker-execute -- run --initiative <slug> --job-id <id> --max-steps <n> --max-runtime-seconds <n> --stop-before-pr --json`
- `harness:parallel-worker-lanes -- run --initiative <slug> --max-parallel <n> --max-runtime-seconds <n> --worker-command <cmd> --json`

## Apply Write Allowlist
Every Phase 3 apply path declares required args, exact delegated command construction, approval requirements, next safe action, and allowed write paths in `.pi/agent/extensions/orchestrator-apply-policy.ts`:
- `product_intake`: `docs/initiatives/<slug>/intake.json`, PRD/backlog/decisions scaffold, and explicit domain README scaffolds.
- `issue_materialization`: `docs/initiatives/**`.
- `product_pipeline`: `docs/initiatives/<slug>/pipeline-runs/*.json`.
- `stitch_prompt`: `docs/initiatives/<slug>/stitch-prompts/<slice>.*`.
- `stitch_artifact`: `docs/initiatives/<slug>/screen-artifacts/<slice>.mock-screen.*`.
- `screen_approval`: `docs/initiatives/<slug>/screen-artifacts/<slice>.approval.json` and requires `--approval-ref`, `--by`, and an approval note or rejection reason.
- `slice_contract`: `docs/initiatives/<slug>/contracts/<slice>.contract.{json,md}`.
- `frontend_packet`: `docs/initiatives/<slug>/packets/<slice>.frontend.packet.{json,md}`.
- `backend_packet`: `docs/initiatives/<slug>/packets/<slice>.backend.packet.{json,md}`.
- `afk_queue_materialization`: `docs/initiatives/<slug>/afk-runs/*.json` plus queue jobs only through the queue-runner helper path; it must include `--queue-only`.

## Run Safety Boundary
- `run` requires `--initiative`, `--max-steps`, and `--max-runtime-seconds` before delegation.
- `--job-id` selects `worker_job`; `--lane parallel_lanes` selects `parallel_lanes`; otherwise the default lane is `queue_level`.
- Exactly one lane may run per invocation.
- Dirty repos and visible protected path mutations block before delegation.
- Optional PR creation boundary requires `--allow-pr-create --approval-ref <ref>` and still stops before merge.
- `parallel_lanes` requires explicit `--worker-command`, and the orchestrator rejects unsafe worker commands containing raw git, merge/apply/sync-main, force, or protected runtime paths.
- `run` records `merge.attempted: false` and does not call merge helpers.

## Safety Boundary
- `classify` reads `package.json`, `docs/initiatives/`, and git branch/status metadata.
- `dry-run` writes no orchestrator files and returns `writesFiles: false`.
- `apply` invokes exactly one allowlisted helper and requires JSON helper output with created-file evidence.
- `apply` rejects generic command strings.
- Low-confidence or ambiguous goals return `status: "needs_input"`, `selectedPath: "clarification"`, and `delegatedCommand: null`.
- Placeholder commands such as `<initiative-slug>` or `<pr-number>` are not executed.
- Unsafe delegated commands are rejected before execution, including `create`, `merge`, `sync-main`, raw `git`, `harness:merge -- apply`, `pr-lifecycle create`, and direct `.pi/agent/state/runtime/*.json` mutation.
- Merge requests delegate to `harness:merge check` only during dry-run, never `apply` or `run`.

## Validation
```bash
npm run validate:orchestrator-classifier
npm run validate:orchestrator-dry-run
npm run validate:orchestrator-apply
npm run validate:orchestrator-run
```
