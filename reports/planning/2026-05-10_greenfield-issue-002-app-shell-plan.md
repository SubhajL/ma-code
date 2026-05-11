# Greenfield Issue 002 App Shell Plan

## Goal
- Implement a minimal `apps/web` app shell for issue-002.
- Keep the slice independent from backend work.

## Acceptance Criteria
- App shell renders a placeholder route without backend dependencies.
- Validation passes with package-local test and build commands.

## First TDD Slice
- Add an app-shell contract test that fails because `apps/web/src/App.tsx` does not exist yet.
- Implement the smallest route/view-model shell to make the test pass.
