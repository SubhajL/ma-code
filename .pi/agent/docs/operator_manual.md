# Operator Documentation Index

This is the main entrypoint for HARNESS-041.
Use it when you need the full operator documentation set instead of a chat-history summary.

## Start here
1. Quick orientation: `.pi/agent/docs/operator_quickstart.md`
2. Daily operation loop: `.pi/agent/docs/operator_workflow.md`
3. Full install/bootstrap path: `.pi/agent/docs/operator_install_guide.md`

## Full operator guides
- install guide: `.pi/agent/docs/operator_install_guide.md`
- provider setup guide: `.pi/agent/docs/operator_provider_setup.md`
- model routing guide: `.pi/agent/docs/operator_model_routing_guide.md`
- role guide: `.pi/agent/docs/operator_role_guide.md`
- troubleshooting guide: `.pi/agent/docs/operator_troubleshooting_guide.md`
- safety rules: `.pi/agent/docs/operator_safety_rules.md`
- extension explanation: `.pi/agent/docs/operator_extension_guide.md`
- scheduled workflow operating guide: `.pi/agent/docs/operator_scheduled_workflows.md`
- packaging/bootstrap reference: `.pi/agent/docs/harness_package_install.md`

## What a new operator should be able to do from this doc set
- install the harness into a repo
- configure providers and model routing
- understand what each role is for
- inspect queue/task/scheduled state
- inspect execution lease state and clear only stale leases
- pause, resume, or stop bounded execution safely
- integrate a validated linked worktree branch into local main through a bounded helper
- run validators and interpret the result surfaces
- troubleshoot common local/runtime/provider issues
- understand which extensions own which parts of the behavior

## Suggested reading order for a new operator
1. `operator_install_guide.md`
2. `operator_provider_setup.md`
3. `operator_model_routing_guide.md`
4. `operator_role_guide.md`
5. `operator_workflow.md`
6. `operator_scheduled_workflows.md`
7. `operator_safety_rules.md`
8. `operator_troubleshooting_guide.md`
9. `operator_extension_guide.md`

## Lease safety boundary
- Use `npm run harness:status` to see queue-session lease status in the normal operator snapshot.
- Use `npm run harness:leases` or `npm run harness:leases:json` for focused lease inspection.
- Use `npm run harness:leases -- clear-stale` only to remove expired/stale leases.
- Active lease force-clearing is not a default operator action; resolve the owning run or wait for expiry instead.

## Local main integration boundary
- Use `npm run harness:integrate -- --worktree <path>` instead of raw `git merge` when moving a validated linked worktree branch into local `main`.
- The helper requires merge-ready worktree evidence, uses fast-forward-only semantics, and acquires one integration lease so concurrent local-main mutations stay serialized.
- The helper blocks on tracked dirt and unexpected untracked files in the root worktree.
- Narrow generated validation artifacts under `reports/validation/*-validation-script.(md|json)` are tolerated.
- Post-merge validator reports are written to temp paths by default to avoid creating new repo-root artifacts.
