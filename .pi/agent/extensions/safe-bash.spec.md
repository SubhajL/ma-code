# safe-bash extension spec

## Purpose
Reduce accidental repo or environment damage by blocking or requiring extra scrutiny for risky shell actions.

## Commands to block by default
- broad file deletion
- destructive git history changes
- secret file writes
- protected branch edits

## Commands to warn or require explicit override
- mass renames
- sweeping chmod/chown changes
- environment mutation commands
- package manager updates affecting large dependency surfaces

## Suggested behavior
- classify command risk
- explain why a command is blocked
- suggest a safer alternative when possible
- log risky attempts

## Version 1 scope
- no fancy UI required
- terminal explanation is enough
- focus on safety before presentation
