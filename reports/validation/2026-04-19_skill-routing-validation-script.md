# Automated Validation Report — Skill Routing

- Date: 2026-04-19
- Generated at: 2026-04-19T14:25:58+0700
- Repo root: /Users/subhajlimanond/dev/ma-code
- Pi binary: pi
- Python binary: python3
- Live probe mode: repo-default Pi runtime
- Temporary root: /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.cMR4oLRm7J

## Summary Table

| Check | Status | Notes |
|---|---|---|
| 1. helper-level route classification | PASS | All required route cases matched expected skill selection, including explicit /skill preservation and bare-review non-match guard. |
| 2. routing extension TypeScript compile | PASS | g-skill-auto-route.ts compiled successfully. |
| 3. live planning route | PASS | Raw planning prompt routed to g-planning-shaped output. |
| 4. live coding route | PASS | Raw coding prompt routed to g-coding-shaped output. |
| 5. live architecture review route | PASS | Raw architecture review prompt routed to g-review-shaped output. |
| 6. live explicit skill preservation | PASS | Explicit /skill:g-coding prompt remained g-coding-shaped under the routing extension. |

## Final Decision
- Status: PASS
- Failed checks: 0

## 1. helper-level route classification
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.cMR4oLRm7J/route-runtime && npx tsx /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.cMR4oLRm7J/check_1_helper_routes.mts
```

### Key Evidence
- helper results written to: /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.cMR4oLRm7J/check_1_helper_routes.txt
- route cases covered:
  - planning intent
  - coding intent
  - bounded review intent
  - architecture review intent
  - explicit /skill:g-coding preservation
  - bare review non-match guard

## 2. routing extension TypeScript compile
- Status: PASS

### Command
```bash
cd /var/folders/mp/3ghkj_pn7kz5nb25brmtq8000000gn/T/tmp.cMR4oLRm7J/route-runtime && npx tsc --noEmit --skipLibCheck --moduleResolution nodenext --module nodenext --target es2022 --lib es2022,dom --types node src/g-skill-auto-route.ts
```

### Key Evidence
- no TypeScript errors emitted

## 3. live planning route
- Status: PASS

### Command
```bash
pi --tools read,grep,find,ls --no-session --no-extensions -e /Users/subhajlimanond/dev/ma-code/.pi/agent/extensions/g-skill-auto-route.ts --no-skills --skill /Users/subhajlimanond/dev/ma-code/packages/pi-g-skills/skills/g-planning --skill /Users/subhajlimanond/dev/ma-code/packages/pi-g-skills/skills/g-coding --skill /Users/subhajlimanond/dev/ma-code/packages/pi-g-skills/skills/g-check --skill /Users/subhajlimanond/dev/ma-code/packages/pi-g-skills/skills/g-review --print "plan a docs-only clarification task and return only the required top-level section headers exactly."
```

### Key Evidence
- observed headers included:
  - ## Discovery Path
  - ## Goal
  - ## Non-Goals
  - ## Pi Log Update

## 4. live coding route
- Status: PASS

### Command
```bash
pi --tools read,grep,find,ls --no-session --no-extensions -e /Users/subhajlimanond/dev/ma-code/.pi/agent/extensions/g-skill-auto-route.ts --no-skills --skill /Users/subhajlimanond/dev/ma-code/packages/pi-g-skills/skills/g-planning --skill /Users/subhajlimanond/dev/ma-code/packages/pi-g-skills/skills/g-coding --skill /Users/subhajlimanond/dev/ma-code/packages/pi-g-skills/skills/g-check --skill /Users/subhajlimanond/dev/ma-code/packages/pi-g-skills/skills/g-review --print "implement a docs-only clarification task and return only the required top-level section headers exactly."
```

### Key Evidence
- observed headers included:
  - ## Discovery Path
  - ## Goal
  - ## TDD Plan
  - ## g-check Handoff

## 5. live architecture review route
- Status: PASS

### Command
```bash
pi --tools read,grep,find,ls --no-session --no-extensions -e /Users/subhajlimanond/dev/ma-code/.pi/agent/extensions/g-skill-auto-route.ts --no-skills --skill /Users/subhajlimanond/dev/ma-code/packages/pi-g-skills/skills/g-planning --skill /Users/subhajlimanond/dev/ma-code/packages/pi-g-skills/skills/g-coding --skill /Users/subhajlimanond/dev/ma-code/packages/pi-g-skills/skills/g-check --skill /Users/subhajlimanond/dev/ma-code/packages/pi-g-skills/skills/g-review --print "review architecture and return only the required top-level section headers exactly."
```

### Key Evidence
- observed headers included:
  - ## Discovery Path
  - ## Reviewed Scope
  - ## As-Is Pipeline Diagram
  - ## Pi Log Update

## 6. live explicit skill preservation
- Status: PASS

### Command
```bash
pi --tools read,grep,find,ls --no-session --no-extensions -e /Users/subhajlimanond/dev/ma-code/.pi/agent/extensions/g-skill-auto-route.ts --no-skills --skill /Users/subhajlimanond/dev/ma-code/packages/pi-g-skills/skills/g-planning --skill /Users/subhajlimanond/dev/ma-code/packages/pi-g-skills/skills/g-coding --skill /Users/subhajlimanond/dev/ma-code/packages/pi-g-skills/skills/g-check --skill /Users/subhajlimanond/dev/ma-code/packages/pi-g-skills/skills/g-review --print "/skill:g-coding implement a docs-only clarification task and return only the required top-level section headers exactly."
```

### Key Evidence
- observed headers included:
  - ## Discovery Path
  - ## TDD Plan
  - ## g-check Handoff
