# Merge / Release Policy

Phase 8 adds a bounded merge helper. It is a merge-readiness and PR-merge tool only; it is not deployment, release tagging, changelog publishing, or environment release orchestration.

## Policy artifact
- Machine-readable policy: `.pi/agent/release/merge-release-policy.json`
- Helper: `scripts/harness-merge.ts`
- Dedicated validator: `scripts/validate-merge-helper.sh`

## Required readiness
`harness:merge` requires all of the following before apply can merge:
- slice lifecycle target `merge_ready`
- PR gate final state `pass`
- PR is open and not draft
- PR merge state is clean
- no requested-changes reviews
- no blocking comments or reviews
- local repo is clean for `apply`
- merge method is allowed by policy

## Commands
```bash
npm run harness:merge -- check --pr <number>
npm run harness:merge -- apply --pr <number> --method squash
npm run harness:merge -- apply --pr <number> --method squash --sync-main
npm run validate:merge-helper
```

## Sync-main boundary
`apply` never syncs local main by default. Local sync happens only when the operator passes `--sync-main`; otherwise use `npm run harness:sync-main` separately after merge.

## Relationship to other helpers
- `g-submit` submits or updates PRs only and should hand off merge decisions to `harness:merge`.
- `harness:pr-gate` remains standalone and is composed by the merge helper.
- `harness:sync-main` remains standalone and is called only when `--sync-main` is explicit.
- Slice lifecycle evidence from Phase 6 remains the merge-readiness precondition.

## Out of scope
- deployment automation
- release tagging
- changelog generation or publishing
- hidden auto-merge
- merge conflict auto-resolution
