# Master Orchestrator — Phase 1

## Scope
- Phase 1 is a read-only deterministic classifier.
- It maps a human goal to one known harness path and returns an advisory next dry-run/status/check command.
- It does not execute returned commands.
- It does not create queue jobs, runtime tasks, PRs, merges, or implementation work.

## Command
```bash
npm run harness:orchestrate -- classify --goal "Build checkout mini flow" --json
npm run harness:operator -- orchestrate classify --goal "Build checkout mini flow" --json
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

## Read-only Boundary
- The CLI reads `package.json`, `docs/initiatives/`, and git branch/status metadata.
- The classifier returns JSON on stdout only.
- Ambiguous goals return `selectedPath: "clarification"` and `nextDryRunCommand: null`.
- Merge requests return a `harness:merge check` command only, never an apply command.

## Validation
```bash
npm run validate:orchestrator-classifier
```
