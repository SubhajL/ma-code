# Automated Validation Report — Queue Semantics

- Date: 2026-04-20
- Generated at: 2026-04-20T15:55:18+0700
- Repo root: /Users/subhajlimanond/dev/ma-code-worktrees/harness-009-queue-semantics
- Python binary: python3
- Temporary root: /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.wicPIKrC2e

## Summary Table

| Check | Status | Notes |
|---|---|---|
| 1. queue schema defines versioned queue object | PASS | Queue schema uses the expected versioned top-level object with bounded job fields. |
| 2. queue runtime placeholder matches finalized empty-state shape | PASS | Queue runtime placeholder matches the finalized empty-state object. |
| 3. queue docs describe the finalized contract | PASS | Queue docs describe the versioned runtime shape and key lifecycle semantics. |
| 4. queue validator is discoverable in operator and repo workflows | PASS | Queue validator is wired into operator docs, static checks, README, and CI. |

## 1. queue schema defines versioned queue object
- Status: PASS

### Command
```bash
python3 /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.wicPIKrC2e/check_1_queue_schema_contract.py
```

### Key Evidence
- schema output:

```
queue-schema-ok
```

## 2. queue runtime placeholder matches finalized empty-state shape
- Status: PASS

### Command
```bash
python3 /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.wicPIKrC2e/check_2_runtime_placeholder_alignment.py
```

### Key Evidence
- runtime output:

```
queue-runtime-ok
```

## 3. queue docs describe the finalized contract
- Status: PASS

### Command
```bash
python3 /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.wicPIKrC2e/check_3_queue_docs_alignment.py
```

### Key Evidence
- docs output:

```
queue-docs-ok
```

## 4. queue validator is discoverable in operator and repo workflows
- Status: PASS

### Command
```bash
python3 /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.wicPIKrC2e/check_4_discoverability_wiring.py
```

### Key Evidence
- discoverability output:

```
queue-discoverability-ok
```

## Final Decision
- Overall status: PASS
- Failed checks: 0
- Summary JSON: reports/validation/2026-04-20_queue-semantics-validation-script.json
