# Automated Validation Report — Harness Package Bootstrap

- Date: 2026-05-06
- Generated at: 2026-05-06T09:09:46+0700
- Repo root: /Users/subhajlimanond/dev/ma-code-worktrees/task-1778032956826-phase-0-slice-1
- Node binary: node
- npm binary: npm
- Python binary: python3
- Temporary root: /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.x3LgU0HS9s

## Summary Table

| Check | Status | Notes |
|---|---|---|
| 1. harness package helper compiles | PASS | harness-package helper and bootstrap integration test compile in an isolated runtime package. |
| 2. harness package bootstrap integration | PASS | bootstrap integration tests passed for reusable asset copy, fresh runtime placeholder generation, package.json merge behavior, and preservation of existing repo-local files. |
| 3. package manifest/install/operator doc wiring | PASS | package manifest, install docs, package-script wiring, and operator-doc entrypoints are present for repeatable harness bootstrap and onboarding. |

## Detailed Results

## 1. harness package helper compiles
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.x3LgU0HS9s/package-runtime && npx tsc --noEmit --skipLibCheck --allowImportingTsExtensions --moduleResolution nodenext --module nodenext --target es2022 --lib es2022,dom --types node scripts/harness-package.ts tests/integration/harness-package.test.ts
```

### Key Evidence
- output:

```

```

## 2. harness package bootstrap integration
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.x3LgU0HS9s/package-runtime && HARNESS_SOURCE_ROOT=/Users/subhajlimanond/dev/ma-code-worktrees/task-1778032956826-phase-0-slice-1 node --import tsx --test tests/integration/harness-package.test.ts
```

### Key Evidence
- output:

```
✔ harness package bootstrap copies reusable assets and generates fresh repo-local placeholders (82.852667ms)
✔ harness package bootstrap preserves existing repo-local files instead of overwriting them (67.788833ms)
ℹ tests 2
ℹ suites 0
ℹ pass 2
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 280.143167
```

## 3. package manifest/install/operator doc wiring
- Status: PASS

### Command
```bash
python3 /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.x3LgU0HS9s/check_3_manifest_and_install_docs.py
```

### Key Evidence
- output:

```
harness-package-wiring-ok
```
