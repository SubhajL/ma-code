// Module-level re-entry flag for the atomic queue+tasks coordination scope.
//
// SQLite (with default journaling) does not support nested transactions on a
// single connection, and opening a second connection inside an open
// BEGIN IMMEDIATE on the first will block waiting for the write lock.
// Either case is a hard-to-diagnose deadlock for callers.
//
// The flag here is used by `withAtomicQueueAndTasksMutation` to (a) refuse to
// nest itself and (b) signal to the single-entity `mutateTasksState` /
// `mutateQueueState` / `writeTasksState` / `writeQueueState` helpers that
// they are being called from inside the coordinated scope and must refuse
// with a clear, actionable error.
//
// JavaScript is single-threaded per event loop, so a plain module-level
// boolean is sufficient. We intentionally do not use AsyncLocalStorage:
// the rule is "no nested coordinated mutations from any caller, ever",
// which is best expressed as a single global gate. If a future use case
// needs per-call-stack tracking, we can swap implementations behind the
// same exported function names.

let coordinatedActive = false;

export function isInsideCoordinatedScope(): boolean {
  return coordinatedActive;
}

export function beginCoordinatedScope(): void {
  if (coordinatedActive) {
    throw new Error(
      "withAtomicQueueAndTasksMutation cannot be nested inside another " +
        "coordinated transaction. Mutate the snapshot the outer callback " +
        "received and let the outer scope commit.",
    );
  }
  coordinatedActive = true;
}

export function endCoordinatedScope(): void {
  coordinatedActive = false;
}

export function assertNotInsideCoordinatedScope(callerName: string): void {
  if (coordinatedActive) {
    throw new Error(
      `${callerName} cannot be called from inside withAtomicQueueAndTasksMutation. ` +
        `Mutate the snapshot the coordinated callback received and let the coordinated ` +
        `scope commit both tasks and queue state in one SQLite transaction.`,
    );
  }
}
