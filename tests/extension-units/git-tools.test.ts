import assert from "node:assert/strict";
import test from "node:test";

import {
  default as gitToolsExtension,
  executeGitBranch,
  executeGitCheckout,
  executeGitPush,
  validateGitBranchInput,
  validateGitCheckoutInput,
  validateGitPushInput,
  type GitToolsDeps,
} from "../../.pi/agent/extensions/git-tools.ts";
import { FakePi, makeCtx, makeTempRepo, textContent } from "./test-utils.ts";

interface FakeExecBehavior {
  branch?: string;
  branches?: string[];
  checkRefCode?: number;
  checkRefStderr?: string;
  branchCode?: number;
  branchStderr?: string;
  switchCode?: number;
  switchStderr?: string;
  pushCode?: number;
  pushStderr?: string;
}

interface FakeExec {
  exec: GitToolsDeps["exec"];
  calls: Array<{ cmd: string; args: string[] }>;
}

function fakeExec(behavior: FakeExecBehavior = {}): FakeExec {
  const calls: Array<{ cmd: string; args: string[] }> = [];
  const exec: GitToolsDeps["exec"] = async (cmd, args) => {
    calls.push({ cmd, args });
    if (cmd !== "git") return { code: 1, stdout: "", stderr: "unexpected command" };

    if (args.includes("branch") && args.includes("--show-current")) {
      return { code: 0, stdout: `${behavior.branch ?? "feature/current"}\n`, stderr: "" };
    }
    if (args.includes("check-ref-format")) {
      return { code: behavior.checkRefCode ?? 0, stdout: "", stderr: behavior.checkRefStderr ?? "" };
    }
    if (args.includes("branch") && args.includes("--list")) {
      return {
        code: behavior.branchCode ?? 0,
        stdout: (behavior.branches ?? ["main", "feature/current"]).join("\n") + "\n",
        stderr: behavior.branchStderr ?? "",
      };
    }
    if (args.includes("branch")) {
      return { code: behavior.branchCode ?? 0, stdout: "", stderr: behavior.branchStderr ?? "" };
    }
    if (args.includes("switch")) {
      return { code: behavior.switchCode ?? 0, stdout: "", stderr: behavior.switchStderr ?? "" };
    }
    if (args.includes("push")) {
      return { code: behavior.pushCode ?? 0, stdout: "pushed\n", stderr: behavior.pushStderr ?? "" };
    }
    return { code: 1, stdout: "", stderr: `unhandled git args: ${args.join(" ")}` };
  };
  return { exec, calls };
}

test("validateGitBranchInput rejects unsupported action", () => {
  const result = validateGitBranchInput({ action: "delete" as any, name: "feature/x" });
  assert.equal(result.ok, false);
  assert.match(result.reason ?? "", /unsupported branch action/);
});

test("validateGitBranchInput rejects unsafe branch names", () => {
  const result = validateGitBranchInput({ action: "create", name: "-bad" });
  assert.equal(result.ok, false);
  assert.match(result.reason ?? "", /branch name/);
});

test("executeGitBranch shows current branch", async () => {
  const { exec, calls } = fakeExec({ branch: "feature/current" });
  const audits: Array<Record<string, unknown>> = [];
  const outcome = await executeGitBranch(
    { exec, cwd: "/repo", appendAudit: async (entry) => { audits.push(entry); } },
    { action: "show_current" },
  );

  assert.equal(outcome.ok, true);
  assert.equal(outcome.currentBranch, "feature/current");
  assert.equal(calls.some((call) => call.args.includes("--show-current")), true);
  assert.equal(audits[0].tool, "git_branch");
  assert.equal(audits[0].action, "shown");
});

test("executeGitBranch creates branch with check-ref-format", async () => {
  const { exec, calls } = fakeExec();
  const audits: Array<Record<string, unknown>> = [];
  const outcome = await executeGitBranch(
    { exec, cwd: "/repo", appendAudit: async (entry) => { audits.push(entry); } },
    { action: "create", name: "feature/new", startPoint: "origin/main" },
  );

  assert.equal(outcome.ok, true);
  assert.equal(outcome.branch, "feature/new");
  assert.equal(calls.some((call) => call.args.includes("check-ref-format")), true);
  const branchCall = calls.find((call) => call.args.includes("branch") && !call.args.includes("--show-current"));
  assert.ok(branchCall);
  assert.deepEqual(branchCall.args, ["-C", "/repo", "branch", "feature/new", "origin/main"]);
  assert.equal(audits[0].action, "created");
});

test("executeGitBranch reports git branch failure", async () => {
  const { exec } = fakeExec({ branchCode: 1, branchStderr: "already exists" });
  const outcome = await executeGitBranch(
    { exec, cwd: "/repo" },
    { action: "create", name: "feature/existing" },
  );

  assert.equal(outcome.ok, false);
  assert.match(outcome.reason ?? "", /git branch failed/);
  assert.match(outcome.reason ?? "", /already exists/);
});

test("validateGitCheckoutInput refuses main by default", () => {
  const result = validateGitCheckoutInput({ branch: "main" });
  assert.equal(result.ok, false);
  assert.match(result.reason ?? "", /refusing to switch to main/);
});

test("executeGitCheckout creates and switches branch", async () => {
  const { exec, calls } = fakeExec({ branch: "feature/current" });
  const audits: Array<Record<string, unknown>> = [];
  const outcome = await executeGitCheckout(
    { exec, cwd: "/repo", appendAudit: async (entry) => { audits.push(entry); } },
    { branch: "feature/new", create: true, startPoint: "origin/main" },
  );

  assert.equal(outcome.ok, true);
  assert.equal(outcome.previousBranch, "feature/current");
  assert.equal(outcome.branch, "feature/new");
  assert.equal(calls.some((call) => call.args.includes("check-ref-format")), true);
  const switchCall = calls.find((call) => call.args.includes("switch"));
  assert.ok(switchCall);
  assert.deepEqual(switchCall.args, ["-C", "/repo", "switch", "-c", "feature/new", "origin/main"]);
  assert.equal(audits[0].tool, "git_checkout");
  assert.equal(audits[0].action, "switched");
});

test("executeGitCheckout supports explicit main override", async () => {
  const { exec, calls } = fakeExec({ branch: "feature/current" });
  const outcome = await executeGitCheckout(
    { exec, cwd: "/repo" },
    { branch: "main", allowMain: true },
  );

  assert.equal(outcome.ok, true);
  const switchCall = calls.find((call) => call.args.includes("switch"));
  assert.ok(switchCall);
  assert.deepEqual(switchCall.args, ["-C", "/repo", "switch", "main"]);
});

test("validateGitPushInput refuses main branch", () => {
  const result = validateGitPushInput({ branch: "main" });
  assert.equal(result.ok, false);
  assert.match(result.reason ?? "", /refusing to push main/);
});

test("validateGitPushInput rejects force-shaped branch values", () => {
  const result = validateGitPushInput({ branch: "+feature/x" });
  assert.equal(result.ok, false);
  assert.match(result.reason ?? "", /force push/);
});

test("executeGitPush pushes current branch with upstream", async () => {
  const { exec, calls } = fakeExec({ branch: "feature/current" });
  const audits: Array<Record<string, unknown>> = [];
  const outcome = await executeGitPush(
    { exec, cwd: "/repo", appendAudit: async (entry) => { audits.push(entry); } },
    { setUpstream: true },
  );

  assert.equal(outcome.ok, true);
  assert.equal(outcome.branch, "feature/current");
  const pushCall = calls.find((call) => call.args.includes("push"));
  assert.ok(pushCall);
  assert.deepEqual(pushCall.args, ["-C", "/repo", "push", "-u", "origin", "feature/current"]);
  assert.equal(pushCall.args.includes("--force"), false);
  assert.equal(audits[0].tool, "git_push");
  assert.equal(audits[0].action, "pushed");
});

test("executeGitPush refuses current main branch", async () => {
  const { exec, calls } = fakeExec({ branch: "main" });
  const outcome = await executeGitPush({ exec, cwd: "/repo" }, {});

  assert.equal(outcome.ok, false);
  assert.match(outcome.reason ?? "", /refusing to push main/);
  assert.equal(calls.some((call) => call.args.includes("push")), false);
});

test("executeGitPush rejects force-shaped current branch values", async () => {
  const { exec, calls } = fakeExec({ branch: "+feature/current" });
  const outcome = await executeGitPush({ exec, cwd: "/repo" }, {});

  assert.equal(outcome.ok, false);
  assert.match(outcome.reason ?? "", /force push/);
  assert.equal(calls.some((call) => call.args.includes("push")), false);
});

test("git tools extension registers branch, checkout, and push tools", async () => {
  const cwd = await makeTempRepo("git-tools-registration-");
  const pi = new FakePi("feature/current");
  gitToolsExtension(pi as any);

  const branchTool = pi.getTool("git_branch");
  assert.equal(pi.getTool("git_checkout").name, "git_checkout");
  assert.equal(pi.getTool("git_push").name, "git_push");

  const result = await branchTool.execute("tool-call", { action: "show_current" }, undefined, undefined, makeCtx(cwd));
  assert.match(textContent(result), /feature\/current/);
});
