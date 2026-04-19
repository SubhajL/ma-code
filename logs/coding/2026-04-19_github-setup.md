# Coding Log — github-setup

- Date: 2026-04-19
- Scope: Set up GitHub for `ma-code` with repo-appropriate CI/security workflows and GitHub settings.
- Status: complete
- Branch: `bootstrap/github-setup`
- Related planning log: `reports/planning/2026-04-19_github-setup-plan.md`

## Task Group
- bootstrap git/GitHub repo
- add repo-appropriate `.github` baseline
- apply GitHub settings and protections
- record evidence

## Files Investigated
- `AGENTS.md`
- `README.md`
- `logs/CURRENT.md`
- `~/dev/zrl/.github/workflows/*`

## Files Changed
- `.github/workflows/ci.yml`
- `.github/workflows/security.yml`
- `.github/dependabot.yml`
- `.github/CODEOWNERS`
- `.github/pull_request_template.md`
- `.gitignore`
- `scripts/check-repo-static.sh`
- `scripts/check-foundation-extension-compile.sh`
- `README.md`
- `logs/CURRENT.md`
- `reports/planning/2026-04-19_github-setup-plan.md`
- `logs/coding/2026-04-19_github-setup.md`

## Runtime / Validation Evidence
- RED:
  - `cd /Users/subhajlimanond/dev/ma-code && find .github -maxdepth 3 -type f | sort`
  - key failure reason: `.github/` did not exist in `ma-code`
  - `cd /Users/subhajlimanond/dev/ma-code && git remote -v`
  - key failure reason: no Git remote was configured locally before setup
  - `gh repo view SubhajL/ma-code --json name,nameWithOwner,isPrivate,defaultBranchRef,url 2>/dev/null || true`
  - key failure reason: target GitHub repo did not yet exist
- GREEN:
  - local validation:
    - `cd /Users/subhajlimanond/dev/ma-code && ./scripts/check-repo-static.sh`
    - `cd /Users/subhajlimanond/dev/ma-code && ./scripts/check-foundation-extension-compile.sh`
    - `cd /Users/subhajlimanond/dev/ma-code && ./scripts/validate-skill-routing.sh`
    - `cd /Users/subhajlimanond/dev/ma-code && ./scripts/validate-harness-routing.sh`
    - `cd /Users/subhajlimanond/dev/ma-code && ruby -e 'require "yaml"; Dir[".github/**/*.yml", ".github/**/*.yaml"].sort.each { |f| YAML.load_file(f); puts "yaml-ok #{f}" }'`
  - git/GitHub bootstrap:
    - local repo initialized and committed on `bootstrap/github-setup`
    - remote created: `https://github.com/SubhajL/ma-code`
    - remote configured: `origin https://github.com/SubhajL/ma-code.git`
    - pushed branches: `main`, `bootstrap/github-setup`
  - settings readback:
    - `gh repo view SubhajL/ma-code --json nameWithOwner,visibility,isPrivate,defaultBranchRef,url,description`
    - result: public repo, default branch `main`, URL `https://github.com/SubhajL/ma-code`
    - `gh api repos/SubhajL/ma-code --jq '{name:.full_name,delete_branch_on_merge,allow_squash_merge,allow_merge_commit,allow_rebase_merge,allow_auto_merge,has_wiki,has_projects,default_branch}'`
    - result: squash merge only, delete branch on merge enabled, wiki/projects disabled, default branch `main`
    - `gh api repos/SubhajL/ma-code/branches/main/protection`
    - result: strict required checks configured for `CI / Repo Static Checks`, `CI / Foundation Extension Compile`, `CI / Routing Validators`, `Security / CodeQL`
    - `gh api repos/SubhajL/ma-code/automated-security-fixes --jq '{enabled:.enabled}'`
    - result: `enabled: true`
    - workflows registered:
      - `gh workflow list -R SubhajL/ma-code`
      - result includes `CI`, `Security`, and `Dependabot Updates`

## Key Findings
- `zrl` provided useful GitHub workflow patterns, but `ma-code` needed a harness-focused baseline instead of backend/frontend/deploy pipelines
- `ma-code` can use its existing local validators as CI gates because they avoid provider-backed live probing by default
- GitHub settings could be applied immediately after repo/bootstrap because workflow/check names were defined deterministically

## Decisions Made
- use a repo-specific GitHub baseline rather than copying `zrl` blindly
- make the repo public to align with the desired `zrl`-like setup and avoid private-tier limitations
- use CI gates centered on static checks, extension compile checks, and local validators
- use security gates centered on Dependency Review, CodeQL, Dependabot, vulnerability alerts, and automated security fixes
- apply `main` branch protection with required status checks, linear history, and conversation resolution

## Known Risks
- required status checks are configured before the first successful GitHub Actions run, so a small follow-up may still be needed if GitHub reports an unexpected status-context naming mismatch
- branch protection does not currently require PR approval reviews because this repo appears solo-operated and the initial goal was CI/security gating first

## Current Outcome
- planning completed
- implementation completed
- GitHub repo/bootstrap completed
- validation completed

## Next Action
- optionally open a PR from `bootstrap/github-setup` to `main` if you want a review-style merge path, though `main` already points at the same commit

## Implementation Summary (2026-04-19 14:29:00 +0700)

### Goal
- Set up GitHub for `ma-code` with repo-appropriate CI/security workflows and GitHub settings, adapted from `zrl` rather than copied directly.

### What changed
- Added a minimal `.gitignore` for local artifacts that should not be published.
- Added repo-specific GitHub workflows:
  - `CI`
  - `Security`
- Added GitHub support files:
  - Dependabot
  - CODEOWNERS
  - PR template
- Added helper scripts for repo-static checks and foundation-extension compile checks.
- Updated `README.md` with the GitHub automation overview.
- Bootstrapped local git and created the public GitHub repo.
- Applied repository settings and `main` branch protection.

### TDD evidence
- RED:
  - `.github/` absent
  - no git remote configured
  - target GitHub repo absent
- GREEN:
  - local checks all passed
  - workflows parsed cleanly as YAML
  - repo exists publicly at `https://github.com/SubhajL/ma-code`
  - remote and protected `main` branch are configured

### Wiring verification evidence
- Workflow wiring:
  - `.github/workflows/ci.yml` references existing scripts
  - `.github/workflows/security.yml` uses official GitHub security actions
- Repo wiring:
  - `origin` points to `https://github.com/SubhajL/ma-code.git`
- GitHub wiring:
  - workflows are registered in GitHub (`CI`, `Security`, `Dependabot Updates`)
  - branch protection is active on `main`
  - automated security fixes are enabled

### Behavior / risk notes
- this setup is intentionally different from `zrl` because `ma-code` is a harness repo, not an app/deploy repo
- CI avoids provider-backed live validation loops by default
- security coverage is meaningful but still lightweight enough for this repo shape

## Review (2026-04-19 14:29:00 +0700) - working-tree

### Reviewed
- Repo: `/Users/subhajlimanond/dev/ma-code`
- Branch: `bootstrap/github-setup`
- Scope: `working-tree` + GitHub repo/settings for `SubhajL/ma-code`
- Commands Run:
  - local validation commands above
  - `git remote -v`
  - `git branch -vv`
  - `gh repo view SubhajL/ma-code ...`
  - `gh api repos/SubhajL/ma-code ...`
  - `gh api repos/SubhajL/ma-code/branches/main/protection`
  - `gh workflow list -R SubhajL/ma-code`

### Findings
CRITICAL
- none

HIGH
- none

MEDIUM
- none

LOW
- branch protection required-check names may need one follow-up adjustment after the first full Actions run if GitHub surfaces status contexts slightly differently than expected
  - Why it matters: a naming mismatch could block merges until corrected
  - Fix direction: after the first successful workflow run, verify the exact status contexts in GitHub UI/API and adjust if needed
  - Validation still needed: one post-first-run readback if a mismatch appears

### Open Questions / Assumptions
- assumed a public repo was desired because it matches the chosen `zrl`-like baseline and avoids private-tier limitations

### Recommended Tests / Validation
- let GitHub run the new `CI` and `Security` workflows once on the remote repo
- if needed, reconcile required status check names with the first observed remote run contexts

### Rollout Notes
- `ma-code` now has a public GitHub repo and baseline protections
- app/deploy workflows from `zrl` were intentionally not ported

### Review Verdict
- no_required_fixes
