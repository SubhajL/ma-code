# Master Orchestrator — Phase 2

## Scope
- Phase 1 is a read-only deterministic classifier.
- Phase 2 is a delegated dry-run planner.
- It maps a human goal to one known harness path, executes exactly one allowlisted helper in dry-run/status/check form when the classification is concrete, and normalizes the helper response into one operator-readable plan.
- It does not apply artifacts, run queue sessions, execute workers, create PRs, merge, or directly mutate protected runtime JSON.

## Commands
```bash
npm run harness:orchestrate -- classify --goal "Build checkout mini flow" --json
npm run harness:orchestrate -- dry-run --goal "Build checkout flow for shoppers to place orders and complete payments so the team can validate order confirmation acceptance" --json
npm run harness:operator -- orchestrate classify --goal "Build checkout mini flow" --json
npm run harness:operator -- orchestrate dry-run --goal "Build checkout flow for shoppers to place orders and complete payments so the team can validate order confirmation acceptance" --json
```

## Selected Paths
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

## Safety Boundary
- `classify` reads `package.json`, `docs/initiatives/`, and git branch/status metadata.
- `dry-run` writes no orchestrator files and returns `writesFiles: false`.
- Low-confidence or ambiguous goals return `status: "needs_input"`, `selectedPath: "clarification"`, and `delegatedCommand: null`.
- Placeholder commands such as `<initiative-slug>` or `<pr-number>` are not executed.
- Unsafe delegated commands are rejected before execution, including `apply`, `run`, `create`, `merge apply`, raw `git merge`, and direct `.pi/agent/state/runtime/*.json` mutation.
- Merge requests delegate to `harness:merge check` only, never `apply`.

## Validation
```bash
npm run validate:orchestrator-classifier
npm run validate:orchestrator-dry-run
```
