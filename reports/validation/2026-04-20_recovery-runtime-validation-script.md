# Automated Validation Report — Recovery Runtime

- Date: 2026-04-20
- Generated at: 2026-04-20T21:59:55+0700
- Repo root: /Users/subhajlimanond/dev/ma-code
- Pi binary: pi
- Python binary: python3
- Live probe enabled: no
- Temporary root: /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.295NTnHjo9

## Summary Table

| Check | Status | Notes |
|---|---|---|
| 1. helper-level recovery runtime resolution | PASS | Deterministic runtime decision helper checks passed, including task-state-derived evidence. |
| 2. recovery-runtime extension TypeScript compile | PASS | recovery-runtime.ts compiled successfully. |
| 3. live resolve_recovery_runtime_decision tool probe | SKIP | Live probe skipped by default to avoid unnecessary provider-backed validation spend. |


## 1. helper-level recovery runtime resolution
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.295NTnHjo9/recovery-runtime && npx tsx /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.295NTnHjo9/check_1_helper_resolution.mts
```

### Key Evidence
- helper checks passed for retry, rollback, role-specific limits, provider-specific limits, and task-state reuse
- sample output:

```json
{
  "ok": true,
  "cases": 5
}
```

## 2. recovery-runtime extension TypeScript compile
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.295NTnHjo9/recovery-runtime && npx tsc --noEmit --skipLibCheck --allowImportingTsExtensions --moduleResolution nodenext --module nodenext --target es2022 --lib es2022,dom --types node src/harness-routing.ts src/recovery-policy.ts src/recovery-runtime.ts
```

### Key Evidence
- compile output was clean

## 3. live resolve_recovery_runtime_decision tool probe
- Status: SKIP

### Command
```bash
pi --mode json --no-session --no-extensions -e /Users/subhajlimanond/dev/ma-code/.pi/agent/extensions/recovery-policy.ts -e /Users/subhajlimanond/dev/ma-code/.pi/agent/extensions/recovery-runtime.ts -e /Users/subhajlimanond/dev/ma-code/.pi/agent/extensions/harness-routing.ts "Use resolve_recovery_runtime_decision for role backend_worker with currentModelId openai-codex/gpt-5.4, approvalRequired true, and a failed implementation task with retryCount 0, validation fail, and evidence path reports/validation/failure.md. Report the exact recommended action and whether autonomy should halt in one sentence."
```

### Key Evidence
- skipped intentionally unless --include-live is provided
