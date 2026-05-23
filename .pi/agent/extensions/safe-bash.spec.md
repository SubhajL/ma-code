# safe-bash extension spec

## Purpose
Reduce accidental repo or environment damage by blocking or requiring extra scrutiny for risky shell actions. `safe-bash` is a guardrail, not a sandbox.

## Scope and limits
- The extension matches regex patterns against the raw command string before it executes.
- It catches common-shape destructive commands (`rm -rf`, `git reset --hard`, force push, recursive chown/chmod, writes to protected paths).
- It does **not** sandbox execution. A determined or careless caller can bypass every check via `bash -c '...'`, `eval`, base64 piped to `sh`, command substitution (`$(...)`, backticks), shell variable expansion, or aliases.
- It does not constrain what subprocesses spawned by an allowed command can do.
- Treat it as a tripwire for accidental damage, complementary to task discipline, audit logging, and protected-path rules. Do not treat it as a security boundary against an adversarial or determined actor.
- Real isolation for hands-off-keyboard execution requires OS-level sandboxing (bubblewrap, firejail, container) or inverting the tool surface so agents call typed tools instead of arbitrary bash.

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
