# Planning Log — github-setup

- Date: 2026-04-19
- Scope: Set up GitHub for `ma-code` with an adapted repo-specific baseline inspired by `zrl`, including repo creation, CI/security workflows, and GitHub settings.
- Status: complete
- Related coding log: `logs/coding/2026-04-19_github-setup.md`

## Discovery Path
- Local discovery in `ma-code` and reference comparison against `~/dev/zrl`.
- Checked:
  - `AGENTS.md`
  - `README.md`
  - `logs/CURRENT.md`
  - `~/dev/zrl/.github/workflows/*`
  - local repo shape / GitHub readiness (`gh`, remotes, repo existence)
- Auggie requested for bounded discovery; fallback to local discovery if unavailable.

## Goal
- Create and configure a public GitHub repo for `ma-code` with repo-appropriate CI/security gates and GitHub settings.

## Non-Goals
- do not copy `zrl` app/deploy workflows mechanically
- do not add unrelated product build/test pipelines that this repo cannot run
- do not add paid-tier-only assumptions to the setup

## Assumptions
- `ma-code` should be public to match the intended `zrl`-like GitHub setup and avoid private-tier limitations
- current local directory has no Git remote and likely no initialized git history
- repo should remain harness-focused, so workflows should favor static validation, config sanity, and repo hygiene over app-specific runtime stacks

## Cross-Model Check
- none yet

## Plan Draft A
- initialize local git repo if missing
- create public GitHub repo `SubhajL/ma-code`
- add adapted `.github/` baseline:
  - CI workflow for static checks and harness validation surfaces that can run in GitHub Actions without paid/provider-backed secrets
  - security workflow(s) for CodeQL / secret scanning style coverage where available
  - Dependabot for GitHub Actions and npm ecosystems actually present
  - PR template and CODEOWNERS if useful
- push initial branch
- apply GitHub settings via `gh api`:
  - default branch
  - branch protection on `main`
  - required status checks
  - vulnerability/dependency settings where available

## Plan Draft B
- create repo and push minimal files first
- defer GitHub settings until workflows are merged and check names are stable
- then apply protections in a second pass

## Unified Plan
- use a bounded hybrid:
  - create repo and local `.github` baseline in one pass
  - apply only settings that are safe before first green run
  - if required-check names need existing workflow runs, perform settings in a follow-up step after push
- keep workflow scope repo-specific and lightweight

## Files to Modify
- `README.md` (if GitHub workflow/setup docs need a short section)
- `logs/CURRENT.md`
- `reports/planning/2026-04-19_github-setup-plan.md`
- `logs/coding/2026-04-19_github-setup.md`
- possibly `.gitignore` if needed for repo initialization hygiene

## New Files
- `.github/workflows/ci.yml`
- `.github/workflows/security.yml`
- `.github/dependabot.yml`
- `.github/CODEOWNERS`
- `.github/pull_request_template.md`
- optional GitHub helper docs under `.github/` if needed

## TDD Sequence
- 1. RED: identify missing GitHub baseline (`.github/` absent, no repo remote/repo yet).
- 2. Add the smallest repo-appropriate `.github` baseline.
- 3. Run cheap local validation on workflow/config syntax and referenced file paths.
- 4. Create/init git + GitHub repo and push.
- 5. Apply GitHub settings with explicit evidence.
- 6. Re-read effective settings and capture evidence.

## Test Coverage
- workflow YAML/static validation where practical
- script path existence checks
- JSON/YAML syntax sanity
- GitHub repo/settings readback evidence via `gh`

## Acceptance Criteria
- `SubhajL/ma-code` exists and is public
- local repo has GitHub remote configured
- `.github/` baseline exists and is tailored to `ma-code`
- CI/security workflows avoid irrelevant `zrl` app-specific assumptions
- GitHub settings/protections are applied as far as current tier/features allow
- evidence is recorded in coding log

## Wiring Checks
- Repo remote wiring: local git remote points to GitHub repo
- Workflow wiring: `.github/workflows/*.yml` references files/commands that exist in this repo
- GitHub settings wiring: branch protection / settings read back via `gh api`

## Validation
- cheap local syntax/readback checks first
- `gh repo view` / `gh api` readback for repo existence and settings
- avoid provider-backed live validation loops for this task

## Risks
- some GitHub protection/security features may differ by plan or require the repo/default branch/workflow runs to exist first
- local repo currently appears uninitialized, so git bootstrap may need careful hygiene
- required status checks may need a second pass after first workflow run establishes check names

## Completion Note
- Completed for the current bounded GitHub bootstrap slice.
- GitHub repo created: `https://github.com/SubhajL/ma-code`
- Default branch: `main`
- Branch protection applied with required checks for CI/static/security gates.
- Local validation passed before repo/bootstrap and settings application.

## Pi Log Update
- planning log: `reports/planning/2026-04-19_github-setup-plan.md`
- coding log: `logs/coding/2026-04-19_github-setup.md`
