# Operator Troubleshooting Guide

This guide is for common bounded harness problems.

## 1. `npm run ...` fails because `tsx` is missing
Likely cause:
- local dev dependencies have not been installed in this repo/worktree

Try:
```bash
npm install --no-package-lock
```

## 2. Queue status looks wrong or stale
Check:
```bash
npm run harness:status
npm run harness:schedules
```

If the runtime JSON and repo/GitHub truth disagree:
- trust repo/GitHub truth for what actually landed
- treat stale runtime-task entries as bookkeeping drift to reconcile visibly

## 3. A scheduled workflow is due but no queue job was created
That is expected unless you explicitly apply it.

Inspect first:
```bash
npm run harness:schedules
node --import tsx scripts/harness-scheduled-workflows.ts materialize --workflow repo-audit-run
```

Then apply only if intended:
```bash
node --import tsx scripts/harness-scheduled-workflows.ts materialize --workflow repo-audit-run --apply
```

## 4. Queue runner will not start work
Check:
- queue paused state
- active running job already exists
- linked task is blocked/failed
- approval boundary hit
- unsupported budget/stop fields

Useful validator:
```bash
npm run validate:queue-runner
```

## 5. Routing choices look too expensive or too weak
Check:
```bash
npm run validate:harness-routing
npm run validate:tuning-data
```

Then inspect:
- `.pi/agent/models.json`
- `tuning_history`
- critical role floor
- budget override paths

## 6. Package bootstrap did not behave as expected
Check:
```bash
npm run harness:package
npm run validate:harness-package
```

Then inspect:
- `.pi/agent/package/harness-package.json`
- `.pi/agent/package/installed-package.json` in the target repo
- generated repo-local files
- preserved existing target files

## 7. Validation is green locally but you are unsure what to trust
Use this priority order:
1. validator/reviewer outputs
2. concrete repo/GitHub state
3. worker self-report

## 8. When to stop instead of improvising
Stop and escalate when:
- requirements are ambiguous
- two lanes need the same file boundary
- provider/runtime behavior is unreliable twice
- evidence is contradictory
- the safe action is unclear
