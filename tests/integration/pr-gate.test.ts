import assert from "node:assert/strict";
import test from "node:test";

import { buildPrGateSession, renderPrGateSession, type CommandRunner } from "../../scripts/harness-pr-gate.ts";

function fakeGhRunner(responses: unknown[]): { runner: CommandRunner; calls: string[][] } {
  const calls: string[][] = [];
  let checkIndex = 0;
  const runner: CommandRunner = async (command, args) => {
    calls.push([command, ...args]);
    assert.equal(command, "gh");
    assert.equal(args.includes("--watch"), false, "PR gate helper must not use gh --watch");

    if (args[0] === "pr" && args[1] === "checks") {
      const response = responses[Math.min(checkIndex, responses.length - 1)];
      checkIndex += 1;
      if (response && typeof response === "object" && "code" in (response as Record<string, unknown>)) {
        const record = response as { stdout?: string; stderr?: string; code: number };
        return { stdout: record.stdout ?? "", stderr: record.stderr ?? "", code: record.code };
      }
      return { stdout: JSON.stringify(response), stderr: "", code: 0 };
    }

    if (args[0] === "pr" && args[1] === "view") {
      return {
        stdout: JSON.stringify({
          number: 63,
          state: "OPEN",
          reviewDecision: "",
          mergeStateStatus: "CLEAN",
          url: "https://example.test/pull/63",
          comments: [
            { author: { login: "github-actions" }, body: "✅ No vulnerabilities or license issues found.", url: "https://example.test/comment" },
          ],
          reviews: [],
        }),
        stderr: "",
        code: 0,
      };
    }

    throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
  };
  return { runner, calls };
}

test("PR gate helper polls every 180 seconds without gh --watch until checks pass", async () => {
  const { runner, calls } = fakeGhRunner([
    [
      { name: "Repo Static Checks", state: "SUCCESS" },
      { name: "CodeQL", state: "PENDING" },
    ],
    [
      { name: "Repo Static Checks", state: "SUCCESS" },
      { name: "CodeQL", state: "SUCCESS" },
    ],
  ]);
  const sleeps: number[] = [];

  const session = await buildPrGateSession(
    { pr: "63", maxAttempts: 3, includeComments: true },
    { runner, sleep: async (ms) => { sleeps.push(ms); } },
  );

  assert.equal(session.finalStatus, "pass");
  assert.equal(session.intervalSeconds, 180);
  assert.deepEqual(sleeps, [180_000]);
  assert.equal(calls.filter((call) => call[1] === "pr" && call[2] === "checks").length, 2);
  assert.equal(calls.flat().includes("--watch"), false);
  assert.equal(session.commentSummary.blockingCommentCount, 0);
  assert.match(renderPrGateSession(session), /recommended next action: merge_or_sync/);
});

test("PR gate helper treats no-check stacked PRs as pending instead of throwing", async () => {
  const { runner, calls } = fakeGhRunner([
    { stdout: "", stderr: "no checks reported on the 'worker/example' branch", code: 1 },
  ]);

  const session = await buildPrGateSession({ pr: "63", maxAttempts: 1 }, { runner, sleep: async () => undefined });

  assert.equal(session.finalStatus, "timeout");
  assert.equal(session.attempts[0]?.summary.totalCount, 0);
  assert.equal(calls.flat().includes("--watch"), false);
});

test("PR gate helper stops on failed checks and surfaces non-bot comments", async () => {
  const calls: string[][] = [];
  const runner: CommandRunner = async (command, args) => {
    calls.push([command, ...args]);
    assert.equal(args.includes("--watch"), false, "PR gate helper must not use gh --watch");
    if (args[0] === "pr" && args[1] === "checks") {
      return { stdout: JSON.stringify([{ name: "Security", state: "FAILURE" }]), stderr: "", code: 0 };
    }
    if (args[0] === "pr" && args[1] === "view") {
      return {
        stdout: JSON.stringify({
          number: 64,
          state: "OPEN",
          reviewDecision: "CHANGES_REQUESTED",
          mergeStateStatus: "DIRTY",
          url: "https://example.test/pull/64",
          comments: [{ author: { login: "reviewer" }, body: "Please fix the gate failure", url: "https://example.test/comment2" }],
          reviews: [{ author: { login: "reviewer" }, state: "CHANGES_REQUESTED", body: "needs fix" }],
        }),
        stderr: "",
        code: 0,
      };
    }
    throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
  };

  const session = await buildPrGateSession({ pr: "64", maxAttempts: 3 }, { runner, sleep: async () => undefined });

  assert.equal(session.finalStatus, "fail");
  assert.equal(session.commentSummary.blockingCommentCount, 1);
  assert.equal(session.reviewSummary.changesRequestedCount, 1);
  assert.match(renderPrGateSession(session), /recommended next action: fix_required/);
  assert.equal(calls.flat().includes("--watch"), false);
});
