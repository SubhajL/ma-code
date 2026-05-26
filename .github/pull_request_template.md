## Summary
- describe the bounded change

## Validation
- [ ] `./scripts/check-repo-static.sh`
- [ ] `npm run typecheck` (and ratchet `.typecheck-baseline-count` down if it drops)
- [ ] `./scripts/validate-skill-routing.sh` when skill-routing changed
- [ ] `./scripts/validate-harness-routing.sh` when executable harness routing changed
- [ ] other relevant evidence noted below

## Evidence
- changed files:
- validation output:
- unresolved risks / gaps:

## Scope Check
- [ ] no silent scope widening
- [ ] no protected-path mutation without explicit approval
- [ ] no direct `main` workflow bypass
