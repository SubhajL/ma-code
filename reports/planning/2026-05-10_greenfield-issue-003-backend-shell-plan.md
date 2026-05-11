# Greenfield Issue 003 Backend Shell Plan

## Goal
- Implement a minimal `services/api` backend shell for issue-003.
- Keep the slice bounded to a health-check entrypoint only.

## Acceptance Criteria
- Backend service exposes a health check through a bounded server entrypoint.
- Validation passes with package-local test and build commands.

## First TDD Slice
- Add a backend-shell contract test that fails because `services/api/src/server.ts` does not exist yet.
- Implement the smallest health-check entrypoint to make the test pass.
