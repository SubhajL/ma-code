import assert from "node:assert/strict";
import test from "node:test";

import {
  ControlPlaneBlockedError,
  defineControlPlaneCommand,
  runControlPlaneCommand,
  type ControlPlaneCommandSpec,
  type ControlPlaneContext,
  type ControlPlaneResult,
} from "../../.pi/agent/extensions/lib/control-plane.ts";
import { readAuditEntries } from "../../.pi/agent/extensions/lib/audit-log.ts";
import { makeTempRepo } from "./test-utils.ts";

interface EchoInput {
  message: string;
}

interface EchoValue {
  echoed: string;
}

function buildEchoSpec(
  overrides: Partial<ControlPlaneCommandSpec<"echo", EchoInput, EchoValue>> = {},
): ControlPlaneCommandSpec<"echo", EchoInput, EchoValue> {
  const base: ControlPlaneCommandSpec<"echo", EchoInput, EchoValue> = {
    name: "echo",
    parseInput(raw: unknown) {
      if (typeof raw !== "object" || raw === null) {
        return { error: "input_must_be_object" };
      }
      const message = (raw as Record<string, unknown>).message;
      if (typeof message !== "string") {
        return { error: "missing_message" };
      }
      return { input: { message } };
    },
    async run(input) {
      return { echoed: input.message };
    },
  };
  return { ...base, ...overrides };
}

test("runControlPlaneCommand returns ok on success and emits audit", async () => {
  const cwd = await makeTempRepo("control-plane-ok-");
  const spec = buildEchoSpec();

  const result = await runControlPlaneCommand(spec, { message: "hello" }, { cwd });

  assert.equal(result.status, "ok");
  if (result.status !== "ok") return; // type guard
  assert.equal(result.command, "echo");
  assert.deepEqual(result.value, { echoed: "hello" });

  const entries = await readAuditEntries(cwd, { extension: "control-plane" });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].action, "echo:ok");
  assert.equal(typeof entries[0].ts, "string");
});

test("runControlPlaneCommand returns blocked on parseInput failure (no audit)", async () => {
  const cwd = await makeTempRepo("control-plane-parse-blocked-");
  const spec = buildEchoSpec();

  const result = await runControlPlaneCommand(spec, { message: 42 }, { cwd });

  assert.equal(result.status, "blocked");
  if (result.status !== "blocked") return;
  assert.equal(result.command, "echo");
  assert.equal(result.reason, "invalid_input:missing_message");

  const entries = await readAuditEntries(cwd, { extension: "control-plane" });
  assert.equal(entries.length, 0, "parse failures must not pollute the audit log");
});

test("runControlPlaneCommand returns blocked when run() throws ControlPlaneBlockedError", async () => {
  const cwd = await makeTempRepo("control-plane-runtime-blocked-");
  const spec = buildEchoSpec({
    async run(input) {
      if (input.message === "stop") {
        throw new ControlPlaneBlockedError("user_request", { detail: "stop requested" });
      }
      return { echoed: input.message };
    },
  });

  const result = await runControlPlaneCommand(spec, { message: "stop" }, { cwd });

  assert.equal(result.status, "blocked");
  if (result.status !== "blocked") return;
  assert.equal(result.reason, "user_request");
  assert.deepEqual(result.details, { detail: "stop requested" });

  const entries = await readAuditEntries(cwd, { extension: "control-plane" });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].action, "echo:blocked");
  assert.equal((entries[0] as Record<string, unknown>).reason, "user_request");
});

test("runControlPlaneCommand returns failed and emits failed audit on unexpected throw", async () => {
  const cwd = await makeTempRepo("control-plane-failed-");
  const spec = buildEchoSpec({
    async run() {
      throw new TypeError("downstream crashed");
    },
  });

  const result = await runControlPlaneCommand(spec, { message: "hi" }, { cwd });

  assert.equal(result.status, "failed");
  if (result.status !== "failed") return;
  assert.equal(result.error.code, "TypeError");
  assert.equal(result.error.message, "downstream crashed");

  const entries = await readAuditEntries(cwd, { extension: "control-plane" });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].action, "echo:failed");
  assert.equal((entries[0] as Record<string, unknown>).errorCode, "TypeError");
});

test("runControlPlaneCommand context carries cwd and emitAudit affecting audit log", async () => {
  const cwd = await makeTempRepo("control-plane-ctx-");
  let observedCwd: string | undefined;
  const spec = buildEchoSpec({
    async run(input, ctx: ControlPlaneContext) {
      observedCwd = ctx.cwd;
      await ctx.emitAudit({ action: "echo:custom", note: "from-run" });
      return { echoed: input.message };
    },
  });

  const result = await runControlPlaneCommand(spec, { message: "hi" }, { cwd });
  assert.equal(result.status, "ok");
  assert.equal(observedCwd, cwd);

  const entries = await readAuditEntries(cwd, { extension: "control-plane" });
  // expect 2 entries: one custom from inside run() + final :ok
  assert.equal(entries.length, 2);
  const actions = entries.map((e) => e.action).sort();
  assert.deepEqual(actions, ["echo:custom", "echo:ok"]);
});

test("runControlPlaneCommand does not mask result if audit emission throws", async () => {
  const cwd = await makeTempRepo("control-plane-audit-fail-");
  const spec = buildEchoSpec();

  // Force the final audit emission to fail by passing an empty-string cwd to
  // appendAuditEntry through an override. We do that with an injected
  // dependency on the option bag.
  const result = await runControlPlaneCommand(
    spec,
    { message: "hi" },
    {
      cwd,
      emitAudit: async () => {
        throw new Error("audit-down");
      },
    },
  );

  assert.equal(result.status, "ok");
  if (result.status !== "ok") return;
  assert.deepEqual(result.value, { echoed: "hi" });
  assert.equal(result.auditError, "audit-down");
});

test("defineControlPlaneCommand is an identity helper preserving generic inference", () => {
  const spec = defineControlPlaneCommand<"ping", { n: number }, { n: number }>({
    name: "ping",
    parseInput(raw) {
      if (typeof raw !== "object" || raw === null) return { error: "bad" };
      const n = (raw as Record<string, unknown>).n;
      if (typeof n !== "number") return { error: "bad_n" };
      return { input: { n } };
    },
    async run(input) {
      return { n: input.n + 1 };
    },
  });
  assert.equal(spec.name, "ping");
  // Identity preserved — calling parseInput / run works:
  const parsed = spec.parseInput({ n: 2 });
  assert.ok("input" in parsed);
});

test("ControlPlaneResult discriminator narrows on status field", () => {
  function pretendResult(): ControlPlaneResult<"x", { v: number }> {
    return { status: "ok", command: "x", value: { v: 1 } };
  }
  const r = pretendResult();
  if (r.status === "ok") {
    // TS check: r.value is typed
    assert.equal(r.value.v, 1);
  } else {
    assert.fail("expected ok branch");
  }
});
