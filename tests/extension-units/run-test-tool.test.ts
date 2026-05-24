import assert from "node:assert/strict";
import test from "node:test";

import {
  executeRunTest,
  validateRunTestInput,
  type RunTestDeps,
} from "../../.pi/agent/extensions/run-test.ts";

interface FakeExec {
  exec: RunTestDeps["exec"];
  calls: Array<{ cmd: string; args: string[] }>;
}

function fakeExec(impl: (cmd: string, args: string[]) => { code: number; stdout: string; stderr: string }): FakeExec {
  const calls: Array<{ cmd: string; args: string[] }> = [];
  const exec: RunTestDeps["exec"] = async (cmd, args) => {
    calls.push({ cmd, args });
    return impl(cmd, args);
  };
  return { exec, calls };
}

test("validateRunTestInput accepts test:* npm scripts", () => {
  assert.equal(validateRunTestInput({ script: "test:extensions" }).ok, true);
  assert.equal(validateRunTestInput({ script: "test:harness-package" }).ok, true);
});

test("validateRunTestInput accepts validate:* npm scripts", () => {
  assert.equal(validateRunTestInput({ script: "validate:harness-routing" }).ok, true);
});

test("validateRunTestInput accepts standalone typecheck", () => {
  assert.equal(validateRunTestInput({ script: "typecheck" }).ok, true);
});

test("validateRunTestInput rejects unknown script", () => {
  const result = validateRunTestInput({ script: "deploy:prod" });
  assert.equal(result.ok, false);
  assert.match(result.reason ?? "", /must be a known test:\*, validate:\*, or typecheck npm script/);
});

test("validateRunTestInput rejects empty script", () => {
  const result = validateRunTestInput({ script: "" });
  assert.equal(result.ok, false);
});

test("validateRunTestInput rejects --no-verify in args", () => {
  const result = validateRunTestInput({ script: "test:extensions", args: ["--no-verify"] });
  assert.equal(result.ok, false);
  assert.match(result.reason ?? "", /disallowed/);
});

test("validateRunTestInput rejects --ignore-scripts in args", () => {
  const result = validateRunTestInput({ script: "test:extensions", args: ["--ignore-scripts"] });
  assert.equal(result.ok, false);
});

test("executeRunTest invokes `npm run <script>` and records exit code", async () => {
  const { exec, calls } = fakeExec(() => ({ code: 0, stdout: "ok", stderr: "" }));
  const audits: Array<Record<string, unknown>> = [];
  let n = 0;
  const outcome = await executeRunTest(
    {
      exec,
      cwd: "/tmp",
      now: () => (n += 50),
      appendAudit: async (entry) => {
        audits.push(entry);
      },
    },
    { script: "test:extensions" },
  );
  assert.equal(outcome.ok, true);
  assert.equal(outcome.exitCode, 0);
  assert.equal(outcome.script, "test:extensions");
  assert.equal(outcome.stdout, "ok");
  assert.deepEqual(calls, [{ cmd: "npm", args: ["run", "test:extensions"] }]);
  assert.ok(outcome.durationMs > 0);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, "passed");
  assert.equal(audits[0].script, "test:extensions");
  assert.equal(audits[0].exitCode, 0);
});

test("executeRunTest passes extra args after `--` separator", async () => {
  const { exec, calls } = fakeExec(() => ({ code: 0, stdout: "", stderr: "" }));
  await executeRunTest(
    { exec, cwd: "/tmp" },
    { script: "test:extensions", args: ["--reporter", "spec"] },
  );
  assert.deepEqual(calls, [
    { cmd: "npm", args: ["run", "test:extensions", "--", "--reporter", "spec"] },
  ]);
});

test("executeRunTest reports non-zero exit code as failure", async () => {
  const { exec } = fakeExec(() => ({ code: 2, stdout: "", stderr: "fail" }));
  const audits: Array<Record<string, unknown>> = [];
  const outcome = await executeRunTest(
    { exec, cwd: "/tmp", appendAudit: async (entry) => { audits.push(entry); } },
    { script: "test:extensions" },
  );
  assert.equal(outcome.ok, false);
  assert.equal(outcome.exitCode, 2);
  assert.match(outcome.reason ?? "", /exited with code 2/);
  assert.equal(audits[0].action, "failed");
});

test("executeRunTest rejects unknown scripts without calling exec", async () => {
  const { exec, calls } = fakeExec(() => ({ code: 0, stdout: "", stderr: "" }));
  const outcome = await executeRunTest(
    { exec, cwd: "/tmp" },
    { script: "deploy:prod" },
  );
  assert.equal(outcome.ok, false);
  assert.equal(outcome.exitCode, null);
  assert.deepEqual(calls, []);
});

test("executeRunTest records modelId and provider in audit log", async () => {
  const { exec } = fakeExec(() => ({ code: 0, stdout: "", stderr: "" }));
  const audits: Array<Record<string, unknown>> = [];
  await executeRunTest(
    {
      exec,
      cwd: "/tmp",
      modelId: "anthropic/claude-opus-4-7",
      provider: "anthropic",
      appendAudit: async (entry) => { audits.push(entry); },
    },
    { script: "test:extensions" },
  );
  assert.equal(audits[0].modelId, "anthropic/claude-opus-4-7");
  assert.equal(audits[0].provider, "anthropic");
});

test("executeRunTest works without audit hook", async () => {
  const { exec } = fakeExec(() => ({ code: 0, stdout: "done", stderr: "" }));
  const outcome = await executeRunTest(
    { exec, cwd: "/tmp" },
    { script: "test:extensions" },
  );
  assert.equal(outcome.ok, true);
  assert.equal(outcome.stdout, "done");
});
