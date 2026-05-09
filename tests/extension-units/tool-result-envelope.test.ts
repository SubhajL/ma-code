import assert from "node:assert/strict";
import test from "node:test";

import toolResultEnvelope, { compactToolResultEvent, type CompactToolResultEnvelope } from "../../.pi/agent/extensions/tool-result-envelope.ts";
import { FakePi, makeCtx, textContent } from "./test-utils.ts";

function parseEnvelope(result: { content?: Array<{ type: string; text?: string }> }): CompactToolResultEnvelope {
  return JSON.parse(textContent(result)) as CompactToolResultEnvelope;
}

const HARD_RESULT_BUDGET_BYTES = 20_000;

test("write success compacts to path, byte/line counts, and hash without file content", () => {
  const originalContent = "alpha\nbeta\ngamma\n";
  const result = compactToolResultEvent({
    type: "tool_result",
    toolCallId: "write-1",
    toolName: "write",
    input: { path: "src/example.ts", content: originalContent },
    content: [{ type: "text", text: `Wrote ${originalContent}` }],
    details: undefined,
    isError: false,
  } as any);

  const envelope = parseEnvelope(result);
  assert.equal(envelope.status, "ok");
  assert.deepEqual(envelope.paths, ["src/example.ts"]);
  assert.equal(envelope.counts.bytes, Buffer.byteLength(originalContent, "utf8"));
  assert.equal(envelope.counts.lines, 3);
  assert.match(envelope.summary, /write completed/);
  assert.equal(envelope.hashes?.sha256?.length, 64);
  assert.equal(textContent(result).includes(originalContent), false);
});

test("edit success reports replacement count and compact diff stats", () => {
  const result = compactToolResultEvent({
    type: "tool_result",
    toolCallId: "edit-1",
    toolName: "edit",
    input: {
      path: "src/example.ts",
      edits: [
        { oldText: "old", newText: "new" },
        { oldText: "before", newText: "after" },
      ],
    },
    content: [{ type: "text", text: "Applied large diff that should not be preserved" }],
    details: { diff: "--- a/src/example.ts\n+++ b/src/example.ts\n-old\n+new\n-before\n+after\n" },
    isError: false,
  } as any);

  const envelope = parseEnvelope(result);
  assert.equal(envelope.status, "ok");
  assert.deepEqual(envelope.paths, ["src/example.ts"]);
  assert.equal(envelope.counts.replacements, 2);
  assert.equal(envelope.counts.additions, 2);
  assert.equal(envelope.counts.removals, 2);
  assert.equal(textContent(result).includes("Applied large diff"), false);
});

test("bash success includes exit code, duration, and last bounded output lines", () => {
  const result = compactToolResultEvent(
    {
      type: "tool_result",
      toolCallId: "bash-1",
      toolName: "bash",
      input: { command: "npm test" },
      content: [{ type: "text", text: Array.from({ length: 15 }, (_, index) => `output-line-${String(index + 1).padStart(2, "0")}`).join("\n") }],
      details: undefined,
      isError: false,
    } as any,
    { startedAtMs: 1000, endedAtMs: 1750, maxExcerptLines: 5 },
  );

  const envelope = parseEnvelope(result);
  assert.equal(envelope.status, "ok");
  assert.equal(envelope.command, "npm test");
  assert.equal(envelope.exitCode, 0);
  assert.equal(envelope.durationMs, 750);
  assert.equal(envelope.truncated, true);
  assert.deepEqual(envelope.excerpts?.stdout, ["output-line-11", "output-line-12", "output-line-13", "output-line-14", "output-line-15"]);
  assert.equal(textContent(result).includes("output-line-01"), false);
});

test("bash failure preserves bounded first and last diagnostics", () => {
  const failureOutput = [
    "first failure line",
    "stack middle 1",
    "stack middle 2",
    "stack middle 3",
    "last failure line",
    "Command exited with code 2",
  ].join("\n");
  const result = compactToolResultEvent(
    {
      type: "tool_result",
      toolCallId: "bash-2",
      toolName: "bash",
      input: { command: "npm test" },
      content: [{ type: "text", text: failureOutput }],
      details: { fullOutputPath: "/tmp/full-output.txt" },
      isError: true,
    } as any,
    { maxExcerptLines: 5 },
  );

  const envelope = parseEnvelope(result);
  assert.equal(envelope.status, "failed");
  assert.equal(envelope.exitCode, 2);
  assert.equal(envelope.artifactPath, "/tmp/full-output.txt");
  assert.deepEqual(envelope.excerpts?.stdout, [
    "first failure line",
    "stack middle 1",
    "... 2 lines omitted ...",
    "last failure line",
    "Command exited with code 2",
  ]);
  assert.equal(envelope.nextAction, "Inspect the bounded failure excerpt; retrieve artifactPath only if more output is needed.");
});

test("read compacts large text content to metadata and bounded excerpt", () => {
  const body = Array.from({ length: 20 }, (_, index) => `file-line-${index + 1}`).join("\n");
  const result = compactToolResultEvent(
    {
      type: "tool_result",
      toolCallId: "read-1",
      toolName: "read",
      input: { path: "src/large.ts" },
      content: [{ type: "text", text: body }],
      details: { truncation: { truncated: true, totalLines: 200 } },
      isError: false,
    } as any,
    { maxExcerptLines: 4 },
  );

  const envelope = parseEnvelope(result);
  assert.equal(envelope.status, "ok");
  assert.deepEqual(envelope.paths, ["src/large.ts"]);
  assert.equal(envelope.counts.lines, 20);
  assert.equal(envelope.truncated, true);
  assert.deepEqual(envelope.excerpts?.stdout, ["file-line-1", "file-line-2", "file-line-3", "file-line-4"]);
  assert.equal(textContent(result).includes("file-line-20"), false);
});

test("read compaction caps one giant line under the hard result budget", () => {
  const result = compactToolResultEvent(
    {
      type: "tool_result",
      toolCallId: "read-one-line",
      toolName: "read",
      input: { path: "src/giant.txt" },
      content: [{ type: "text", text: "x".repeat(50_000) }],
      details: undefined,
      isError: false,
    },
    {},
  );

  assert.ok(result);
  assert.ok(JSON.stringify(result).length < HARD_RESULT_BUDGET_BYTES);
  const envelope = parseEnvelope(result);
  assert.equal(envelope.tool, "read");
  assert.equal(envelope.truncated, true);
  assert.ok(envelope.excerpts?.stdout?.[0]?.includes("truncated"));
  assert.equal(textContent(result).includes("x".repeat(10_000)), false);
});

test("unsupported oversized tool result gets generic compact envelope", () => {
  const result = compactToolResultEvent(
    {
      type: "tool_result",
      toolCallId: "custom-1",
      toolName: "custom_probe",
      input: { probe: true },
      content: [{ type: "text", text: "y".repeat(50_000) }],
      details: { debug: "z".repeat(50_000) },
      isError: false,
    },
    {},
  );

  assert.ok(result);
  assert.ok(JSON.stringify(result).length < HARD_RESULT_BUDGET_BYTES);
  const envelope = parseEnvelope(result);
  assert.equal(envelope.tool, "custom_probe");
  assert.equal(envelope.truncated, true);
  assert.match(envelope.summary, /global result-size guard/);
  assert.equal(textContent(result).includes("y".repeat(10_000)), false);
  assert.equal(JSON.stringify(result).includes("z".repeat(10_000)), false);
});

test("small unsupported tool result is not replaced by the global fallback", () => {
  const result = compactToolResultEvent(
    {
      type: "tool_result",
      toolCallId: "custom-small",
      toolName: "custom_probe",
      input: {},
      content: [{ type: "text", text: "small result" }],
      details: undefined,
      isError: false,
    },
    {},
  );

  assert.equal(result, undefined);
});

test("extension registers global tool_result hook and preserves specialized timing", async () => {
  const pi = new FakePi("feat/tool-result-envelope");
  toolResultEnvelope(pi as any);

  const onToolExecutionStart = pi.getHandler("tool_execution_start");
  const onToolResult = pi.getHandler("tool_result");
  await onToolExecutionStart({ type: "tool_execution_start", toolCallId: "bash-hook", toolName: "bash", args: { command: "pwd" } });

  const result = await onToolResult(
    {
      type: "tool_result",
      toolCallId: "bash-hook",
      toolName: "bash",
      input: { command: "pwd" },
      content: [{ type: "text", text: "ok" }],
      details: undefined,
      isError: false,
    },
    makeCtx(process.cwd()),
  );

  const envelope = parseEnvelope(result);
  assert.equal(envelope.tool, "bash");
  assert.equal(typeof envelope.durationMs, "number");
});
