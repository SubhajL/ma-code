# AFK worker command derivation and finalization fix plan

- Goal: provide executable worker commands for AFK queue jobs and clean queue/task state on terminal worker outcomes.
- Source plan basis: prior MO AFK worker gap analysis from task-1778472872111.
- First TDD slice: prove worker_job orchestration or worker execution no longer leaves coding skipped solely because implementationCommand was absent.
- Acceptance:
  - AFK queue jobs carry or derive implementation commands.
  - Worker execution no longer silently skips coding for AFK jobs lacking explicit commands.
  - Failed worker runs clear queue activeJobId and finalize linked task state.
  - Fresh greenfield MO verification advances past the old missing-command blocker or exposes a new explicit blocker cleanly.
