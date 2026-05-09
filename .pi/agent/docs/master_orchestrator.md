# Master Orchestrator — Phase 3

## Scope
- Phase 1 is a read-only deterministic classifier.
- Phase 2 is a delegated dry-run planner.
- Phase 3 is a bounded apply/materialize router.
- It maps a human goal or explicit apply path to one known harness path, executes exactly one allowlisted helper, and normalizes the helper response into one operator-readable plan/result.
- It does not execute workers, create PRs, merge, sync main, run raw git, or directly mutate protected runtime JSON.

## Commands
```bash
npm run harness:orchestrate -- classify --goal "Build checkout mini flow" --json
npm run harness:orchestrate -- dry-run --goal "Build checkout flow for shoppers to place orders and complete payments so the team can validate order confirmation acceptance" --json
npm run harness:orchestrate -- apply --path stitch_prompt --initiative checkout --slice slice-001 --json
npm run harness:operator -- orchestrate classify --goal "Build checkout mini flow" --json
npm run harness:operator -- orchestrate dry-run --goal "Build checkout flow for shoppers to place orders and complete payments so the team can validate order confirmation acceptance" --json
npm run harness:operator -- orchestrate apply --path screen_approval --action approve --initiative checkout --slice slice-001 --approval-ref human-123 --by reviewer --note "Approved" --json
```

## Selected Paths
- Phase 2 dry-run paths:
  - `product_feature`
  - `ui_slice`
  - `issue_materialization`
  - `product_pipeline`
  - `afk_queue`
  - `worker_job`
  - `pr_lifecycle`
  - `merge`
  - `status`
  - `clarification`
- Phase 3 apply paths:
  - `product_intake`
  - `issue_materialization`
  - `product_pipeline`
  - `stitch_prompt`
  - `stitch_artifact`
  - `screen_approval`
  - `slice_contract`
  - `frontend_packet`
  - `backend_packet`
  - `afk_queue_materialization`

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

## Safety Boundary
- `classify` reads `package.json`, `docs/initiatives/`, and git branch/status metadata.
- `dry-run` writes no orchestrator files and returns `writesFiles: false`.
- `apply` invokes exactly one allowlisted helper and requires JSON helper output with created-file evidence.
- `apply` rejects generic command strings.
- Low-confidence or ambiguous goals return `status: "needs_input"`, `selectedPath: "clarification"`, and `delegatedCommand: null`.
- Placeholder commands such as `<initiative-slug>` or `<pr-number>` are not executed.
- Unsafe delegated commands are rejected before execution, including `run`, `create`, `merge`, `sync-main`, raw `git`, `harness:merge -- apply`, `pr-lifecycle create`, worker execution, and direct `.pi/agent/state/runtime/*.json` mutation.
- Merge requests delegate to `harness:merge check` only during dry-run, never `apply`.

## Validation
```bash
npm run validate:orchestrator-classifier
npm run validate:orchestrator-dry-run
npm run validate:orchestrator-apply
```
