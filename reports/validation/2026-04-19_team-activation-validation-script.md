# Automated Validation Report — Team Activation

- Date: 2026-04-19
- Generated at: 2026-04-19T17:43:38+0700
- Repo root: /Users/subhajlimanond/dev/ma-code-worktrees/harness-020-team-activation
- Pi binary: pi
- Python binary: python3
- Live probe enabled: yes
- Temporary root: /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.dzBwO8VzbI

## Summary Table

| Check | Status | Notes |
|---|---|---|
| 1. helper-level team activation resolution | PASS | Deterministic helper-level team activation checks passed. |
| 2. team-activation extension TypeScript compile | PASS | team-activation.ts compiled successfully. |
| 3. live resolve_team_activation tool probe | PASS | Live probe observed resolve_team_activation and the expected initial team. |

## 1. helper-level team activation resolution
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.dzBwO8VzbI/activation-runtime && npx tsx /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.dzBwO8VzbI/check_1_helper_resolution.mts
```

### Key Evidence
- helper checks passed for planning-first, build-first, light-quality, recovery, overlap-allowed, and overlap-blocked cases
- sample output:

```json
[
  {
    "name": "planning-first ambiguity",
    "initialTeam": "planning",
    "sequence": [
      "planning"
    ],
    "qualityMode": "none",
    "overlapDecisions": {
      "planningBuild": {
        "allowed": false,
        "reason": "Planning/build overlap is not allowed by default; planning should finish a usable packet before build starts."
      },
      "multipleBuildWorkers": {
        "allowed": false,
        "reason": "Multiple build workers are not allowed because overlap risk or missing isolation would make ownership unclear."
      },
      "qualityBuild": {
        "allowed": false,
        "reason": "Quality should normally evaluate outputs after a bounded implementation packet completes."
      },
      "recoveryWithOthers": {
        "allowed": false,
        "reason": "Recovery should decide retry, reroute, rollback, stop, or escalate before concurrent retry work continues."
      }
    }
  },
  {
    "name": "build-first bounded implementation",
    "initialTeam": "build",
    "sequence": [
      "build",
      "quality"
    ],
    "qualityMode": "full",
    "overlapDecisions": {
      "planningBuild": {
        "allowed": false,
        "reason": "Planning/build overlap is not allowed by default; planning should finish a usable packet before build starts."
      },
      "multipleBuildWorkers": {
        "allowed": false,
        "reason": "Multiple build workers are not allowed because overlap risk or missing isolation would make ownership unclear."
      },
      "qualityBuild": {
        "allowed": false,
        "reason": "Quality should normally evaluate outputs after a bounded implementation packet completes."
      },
      "recoveryWithOthers": {
        "allowed": false,
        "reason": "Recovery should decide retry, reroute, rollback, stop, or escalate before concurrent retry work continues."
      }
    }
  },
  {
    "name": "docs-only light quality",
    "initialTeam": "quality",
    "sequence": [
      "quality"
    ],
    "qualityMode": "light",
    "overlapDecisions": {
      "planningBuild": {
        "allowed": false,
        "reason": "Planning/build overlap is not allowed by default; planning should finish a usable packet before build starts."
      },
      "multipleBuildWorkers": {
        "allowed": false,
        "reason": "Multiple build workers are not allowed because overlap risk or missing isolation would make ownership unclear."
      },
      "qualityBuild": {
        "allowed": false,
        "reason": "Quality should normally evaluate outputs after a bounded implementation packet completes."
      },
      "recoveryWithOthers": {
        "allowed": false,
        "reason": "Recovery should decide retry, reroute, rollback, stop, or escalate before concurrent retry work continues."
      }
    }
  },
  {
    "name": "recovery stops normal flow",
    "initialTeam": "recovery",
    "sequence": [
      "recovery"
    ],
    "qualityMode": "none",
    "overlapDecisions": {
      "planningBuild": {
        "allowed": false,
        "reason": "Planning/build overlap is not allowed by default; planning should finish a usable packet before build starts."
      },
      "multipleBuildWorkers": {
        "allowed": false,
        "reason": "Multiple build workers are not allowed because overlap risk or missing isolation would make ownership unclear."
      },
      "qualityBuild": {
        "allowed": false,
        "reason": "Quality should normally evaluate outputs after a bounded implementation packet completes."
      },
      "recoveryWithOthers": {
        "allowed": false,
        "reason": "Recovery should decide retry, reroute, rollback, stop, or escalate before concurrent retry work continues."
      }
    }
  },
  {
    "name": "planning-build overlap allowed for stable multi-domain work",
    "initialTeam": "planning",
    "sequence": [
      "planning",
      "build",
      "quality"
    ],
    "qualityMode": "full",
    "overlapDecisions": {
      "planningBuild": {
        "allowed": true,
        "reason": "Minimal planning/build overlap is allowed because execution is already bounded and stable enough for a first slice."
      },
      "multipleBuildWorkers": {
        "allowed": false,
        "reason": "Multiple build workers are not allowed because overlap risk or missing isolation would make ownership unclear."
      },
      "qualityBuild": {
        "allowed": false,
        "reason": "Quality should normally evaluate outputs after a bounded implementation packet completes."
      },
      "recoveryWithOthers": {
        "allowed": false,
        "reason": "Recovery should decide retry, reroute, rollback, stop, or escalate before concurrent retry work continues."
      }
    }
  },
  {
    "name": "multiple build workers blocked without non-overlap or isolation",
    "initialTeam": "build",
    "sequence": [
      "build",
      "quality"
```

## 2. team-activation extension TypeScript compile
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.dzBwO8VzbI/activation-runtime && npx tsc --noEmit --skipLibCheck --moduleResolution nodenext --module nodenext --target es2022 --lib es2022,dom --types node src/team-activation.ts
```

### Key Evidence
- compile result: `PASS`

## 3. live resolve_team_activation tool probe
- Status: PASS

### Command
```bash
pi --no-session --no-extensions -e /Users/subhajlimanond/dev/ma-code-worktrees/harness-020-team-activation/.pi/agent/extensions/team-activation.ts --mode json "Use resolve_team_activation for implementation work with clear requirements, bounded scope, explicit acceptance criteria, known repo impact, and only backend domain. Then report the first selected team in one sentence."
```

### Key Evidence
- tool call observed: `resolve_team_activation`
- expected initial team found: `build`

## Final Decision

- Overall status: PASS
- Failed checks: 0
- Summary JSON: /Users/subhajlimanond/dev/ma-code-worktrees/harness-020-team-activation/reports/validation/2026-04-19_team-activation-validation-script.json
