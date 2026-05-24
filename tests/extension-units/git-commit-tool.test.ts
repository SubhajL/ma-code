import assert from "node:assert/strict";
import test from "node:test";

import {
  executeGitCommit,
  validateGitCommitInput,
  type GitCommitDeps,
} from "../../.pi/agent/extensions/git-commit.ts";

interface FakeExecBehavior {
  branch?: string;
  addCode?: number;
  addStderr?: string;
  commitCode?: number;
  commitStderr?: string;
  sha?: string;
}

interface FakeExec {
  exec: GitCommitDeps["exec"];
  calls: Array<{ cmd: string; args: string[] }>;
}

function fakeExec(behavior: FakeExecBehavior = {}): FakeExec {
  const calls: Array<{ cmd: string; args: string[] }> = [];
  const exec: GitCommitDeps["exec"] = async (cmd, args) => {
    calls.push({ cmd, args });
    if (cmd === "git") {
      if (args.includes("branch") && args.includes("--show-current")) {
        return { code: 0, stdout: `${behavior.branch ?? "feature/x"}\n`, stderr: "" };
      }
      if (args.includes("add")) {
        return { code: behavior.addCode ?? 0, stdout: "", stderr: behavior.addStderr ?? "" };
      }
      if (args.includes("commit")) {
        return { code: behavior.commitCode ?? 0, stdout: "", stderr: behavior.commitStderr ?? "" };
      }
      if (args.includes("rev-parse")) {
        return { code: 0, stdout: `${behavior.sha ?? "abc123"}\n`, stderr: "" };
      }
    }
    return { code: 1, stdout: "", stderr: "unhandled" };
  };
  return { exec, calls };
}

test("validateGitCommitInput rejects empty message", () => {
  const result = validateGitCommitInput({ message: "", paths: ["src/file.ts"] });
  assert.equal(result.ok, false);
});

test("validateGitCommitInput rejects whitespace-only message", () => {
  const result = validateGitCommitInput({ message: "   \n", paths: ["src/file.ts"] });
  assert.equal(result.ok, false);
});

test("validateGitCommitInput rejects empty paths", () => {
  const result = validateGitCommitInput({ message: "fix", paths: [] });
  assert.equal(result.ok, false);
});

test("validateGitCommitInput rejects protected .env paths", () => {
  const result = validateGitCommitInput({ message: "fix", paths: [".env"] });
  assert.equal(result.ok, false);
  assert.match(result.reason ?? "", /protected/);
});

test("validateGitCommitInput rejects .env.local", () => {
  const result = validateGitCommitInput({ message: "fix", paths: [".env.local"] });
  assert.equal(result.ok, false);
});

test("validateGitCommitInput rejects .git internals", () => {
  const result = validateGitCommitInput({ message: "fix", paths: [".git/hooks/pre-commit"] });
  assert.equal(result.ok, false);
});

test("validateGitCommitInput rejects runtime state paths", () => {
  const result = validateGitCommitInput({
    message: "fix",
    paths: [".pi/agent/state/runtime/tasks.json"],
  });
  assert.equal(result.ok, false);
});

test("validateGitCommitInput rejects node_modules", () => {
  const result = validateGitCommitInput({
    message: "fix",
    paths: ["node_modules/foo/package.json"],
  });
  assert.equal(result.ok, false);
});

test("validateGitCommitInput accepts normal source paths", () => {
  const result = validateGitCommitInput({
    message: "fix: something",
    paths: ["src/file.ts", "tests/file.test.ts"],
  });
  assert.equal(result.ok, true);
  assert.equal(result.reason, null);
});

test("executeGitCommit refuses to commit on main", async () => {
  const { exec, calls } = fakeExec({ branch: "main" });
  const audits: Array<Record<string, unknown>> = [];
  const outcome = await executeGitCommit(
    { exec, cwd: "/repo", appendAudit: async (entry) => { audits.push(entry); } },
    { message: "fix bug", paths: ["src/foo.ts"] },
  );
  assert.equal(outcome.ok, false);
  assert.equal(outcome.branch, "main");
  assert.match(outcome.reason ?? "", /refusing to commit on main/);
  assert.equal(calls.some((c) => c.args.includes("add")), false);
  assert.equal(calls.some((c) => c.args.includes("commit")), false);
  assert.equal(audits[0].action, "blocked");
  assert.equal(audits[0].branch, "main");
});

test("executeGitCommit stages explicit paths and creates commit on feature branch", async () => {
  const { exec, calls } = fakeExec({ branch: "feature/typed-tools", sha: "deadbeef" });
  const audits: Array<Record<string, unknown>> = [];
  const outcome = await executeGitCommit(
    { exec, cwd: "/repo", appendAudit: async (entry) => { audits.push(entry); } },
    { message: "feat: typed tools", paths: ["src/foo.ts", "src/bar.ts"] },
  );
  assert.equal(outcome.ok, true);
  assert.equal(outcome.commitSha, "deadbeef");
  assert.equal(outcome.branch, "feature/typed-tools");
  assert.deepEqual(outcome.stagedPaths, ["src/foo.ts", "src/bar.ts"]);
  const addCall = calls.find((c) => c.args.includes("add"));
  assert.ok(addCall, "expected git add call");
  assert.ok(addCall.args.includes("--"), "expected -- separator before paths");
  assert.ok(addCall.args.includes("src/foo.ts"));
  assert.ok(addCall.args.includes("src/bar.ts"));
  assert.equal(addCall.args.includes("-A"), false, "must not use git add -A");
  const commitCall = calls.find((c) => c.args.includes("commit"));
  assert.ok(commitCall, "expected git commit call");
  assert.ok(commitCall.args.includes("-m"));
  assert.ok(commitCall.args.includes("feat: typed tools"));
  assert.equal(commitCall.args.includes("--no-verify"), false, "must not skip hooks");
  assert.equal(audits[0].action, "committed");
  assert.equal(audits[0].commitSha, "deadbeef");
});

test("executeGitCommit reports git add failure", async () => {
  const { exec } = fakeExec({
    branch: "feature/x",
    addCode: 1,
    addStderr: "pathspec did not match",
  });
  const outcome = await executeGitCommit(
    { exec, cwd: "/repo" },
    { message: "fix", paths: ["nonexistent.ts"] },
  );
  assert.equal(outcome.ok, false);
  assert.equal(outcome.commitSha, null);
  assert.match(outcome.reason ?? "", /git add failed/);
  assert.match(outcome.reason ?? "", /pathspec did not match/);
});

test("executeGitCommit reports git commit failure", async () => {
  const { exec } = fakeExec({
    branch: "feature/x",
    commitCode: 1,
    commitStderr: "pre-commit hook failed",
  });
  const outcome = await executeGitCommit(
    { exec, cwd: "/repo" },
    { message: "fix", paths: ["src/foo.ts"] },
  );
  assert.equal(outcome.ok, false);
  assert.equal(outcome.commitSha, null);
  assert.match(outcome.reason ?? "", /git commit failed/);
  assert.match(outcome.reason ?? "", /pre-commit hook failed/);
});

test("executeGitCommit supports --signoff when requested", async () => {
  const { exec, calls } = fakeExec({ branch: "feature/x" });
  await executeGitCommit(
    { exec, cwd: "/repo" },
    { message: "fix", paths: ["src/foo.ts"], signoff: true },
  );
  const commitCall = calls.find((c) => c.args.includes("commit"));
  assert.ok(commitCall);
  assert.ok(commitCall.args.includes("--signoff"));
});

test("executeGitCommit supports --allow-empty when requested", async () => {
  const { exec, calls } = fakeExec({ branch: "feature/x" });
  await executeGitCommit(
    { exec, cwd: "/repo" },
    { message: "empty", paths: ["src/foo.ts"], allowEmpty: true },
  );
  const commitCall = calls.find((c) => c.args.includes("commit"));
  assert.ok(commitCall);
  assert.ok(commitCall.args.includes("--allow-empty"));
});

test("executeGitCommit records modelId/provider in audit log", async () => {
  const { exec } = fakeExec({ branch: "feature/x" });
  const audits: Array<Record<string, unknown>> = [];
  await executeGitCommit(
    {
      exec,
      cwd: "/repo",
      modelId: "anthropic/claude-opus-4-7",
      provider: "anthropic",
      appendAudit: async (entry) => { audits.push(entry); },
    },
    { message: "fix", paths: ["src/foo.ts"] },
  );
  assert.equal(audits[0].modelId, "anthropic/claude-opus-4-7");
  assert.equal(audits[0].provider, "anthropic");
});

test("executeGitCommit rejects protected path before touching git", async () => {
  const { exec, calls } = fakeExec({ branch: "feature/x" });
  const outcome = await executeGitCommit(
    { exec, cwd: "/repo" },
    { message: "leak", paths: [".env"] },
  );
  assert.equal(outcome.ok, false);
  assert.match(outcome.reason ?? "", /protected/);
  assert.deepEqual(calls, [], "no git commands should run for protected paths");
});
