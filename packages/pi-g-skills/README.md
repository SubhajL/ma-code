# pi-g-skills

Reusable Pi package that ports the Codex `g-*` workflows into Pi as global skills and small runtime helpers.

Included:
- `g-planning`
- `g-coding`
- `g-check`
- `g-review`
- `auggie_discover` extension
- `second_model_plan` extension restricted to Claude Opus 4.6 with explicit fallback to the main model

## Goals
- Preserve the original `g-*` skill names.
- Preserve TDD, RED/GREEN evidence, wiring verification, skeptical review, and system-review discipline.
- Use Pi-style logs and index conventions instead of Codex `.codex/coding-log.current`.
- Stay Pi-native: no repo-local multi-agent harness assumptions.

## Install globally
```bash
pi install /absolute/path/to/packages/pi-g-skills
```

Or install project-local:
```bash
pi install -l /absolute/path/to/packages/pi-g-skills
```

## Package contents
```text
skills/
  g-planning/
  g-coding/
  g-check/
  g-review/
extensions/
  auggie-discovery.ts
  second-model-opus.ts
```

## Pi log/index mapping
This port intentionally uses Pi-style repo logs rather than Codex `.codex` pointers.

Preferred convention when present:
- `logs/CURRENT.md`
- `logs/coding/`
- `reports/planning/`

See `docs/pi-log-convention.md`.

## Runtime helpers
### `auggie_discover`
- tries Auggie first
- returns compact semantic findings when available
- returns explicit fallback guidance when Auggie is unavailable or unsafe to wait on

### `second_model_plan`
- only attempts Claude Opus 4.6 as the second model
- if not available, returns explicit fallback to the main/current model
- never broadens to Gemini, Sonnet, Copilot, or mini fallback lanes

## Skill name collision note
Pi keeps the first skill found for a duplicated skill name.

If your Pi setup already loads `g-planning`, `g-coding`, `g-check`, or `g-review` from another source such as `~/.codex/skills`, disable that older source first or these package skills will be shadowed.

Practical options:
- remove or disable the old skill source in Pi settings
- use `pi config` to disable the conflicting skill source
- temporarily test this package with explicit `--skill` paths

## Notes
- The skills are process-heavy by design and preserve the original `g-*` workflow shape.
- The extensions are intentionally small and only implement the runtime behaviors that a skill alone cannot enforce reliably.
