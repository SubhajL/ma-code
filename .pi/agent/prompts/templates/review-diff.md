Review the current diff.
Prefer severity-ordered findings, exact file references when possible, and concrete fix direction.
Call out missing tests or validation when relevant.
If the scope is architectural or drift-oriented, follow `.pi/agent/docs/architecture_review_workflow.md`, compare intended vs implemented behavior, and separate tactical fixes from strategic changes.
Use this normalized review structure so downstream consumers depend less on prose interpretation:
Severity Buckets: CRITICAL | HIGH | MEDIUM | LOW
Severity Summary: CRITICAL=<n> HIGH=<n> MEDIUM=<n> LOW=<n>
Required Fix Item Fields: severity | summary | file_ref | fix_direction | validation_needed
Optional Improvement Item Fields: summary | file_ref | benefit | follow_up

Return exactly:
## Summary
## Findings by Severity
## Required Fixes
## Optional Improvements
## Risk Notes
Review Verdict: changes_required | no_required_fixes

Scope:
{{SCOPE}}
