import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  AUDIT_LOG,
  appendAuditEntry,
  readAuditEntries,
} from "../../.pi/agent/extensions/lib/audit-log.ts";
import { makeTempRepo } from "./test-utils.ts";

test("AUDIT_LOG points at the legacy JSONL path", () => {
  assert.equal(AUDIT_LOG, "logs/harness-actions.jsonl");
});

test("appendAuditEntry writes to both SQLite and the JSONL file", async () => {
  const cwd = await makeTempRepo("audit-log-dual-write-");
  await appendAuditEntry(cwd, {
    ts: "2026-05-24T01:00:00.000Z",
    extension: "git-commit",
    action: "committed",
    branch: "feat/x",
  });

  const entries = await readAuditEntries(cwd);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].extension, "git-commit");
  assert.equal(entries[0].action, "committed");
  assert.equal((entries[0] as { branch?: string }).branch, "feat/x");

  const jsonlPath = join(cwd, AUDIT_LOG);
  assert.equal(existsSync(jsonlPath), true);
  const jsonl = await readFile(jsonlPath, "utf8");
  const lines = jsonl.trimEnd().split("\n");
  assert.equal(lines.length, 1);
  const parsed = JSON.parse(lines[0]);
  assert.equal(parsed.extension, "git-commit");
  assert.equal(parsed.action, "committed");
  assert.equal(parsed.ts, "2026-05-24T01:00:00.000Z");
});

test("readAuditEntries returns entries in insertion order", async () => {
  const cwd = await makeTempRepo("audit-log-order-");
  for (const action of ["a1", "a2", "a3", "a4"]) {
    await appendAuditEntry(cwd, {
      ts: new Date().toISOString(),
      extension: "test",
      action,
    });
  }
  const entries = await readAuditEntries(cwd);
  assert.deepEqual(
    entries.map((entry) => entry.action),
    ["a1", "a2", "a3", "a4"],
  );
});

test("readAuditEntries filters by extension", async () => {
  const cwd = await makeTempRepo("audit-log-filter-extension-");
  await appendAuditEntry(cwd, { ts: new Date().toISOString(), extension: "git-commit", action: "x" });
  await appendAuditEntry(cwd, { ts: new Date().toISOString(), extension: "run-test", action: "y" });
  await appendAuditEntry(cwd, { ts: new Date().toISOString(), extension: "git-commit", action: "z" });

  const entries = await readAuditEntries(cwd, { extension: "git-commit" });
  assert.equal(entries.length, 2);
  assert.deepEqual(
    entries.map((entry) => entry.action),
    ["x", "z"],
  );
});

test("readAuditEntries filters by action", async () => {
  const cwd = await makeTempRepo("audit-log-filter-action-");
  await appendAuditEntry(cwd, { ts: new Date().toISOString(), extension: "safe-bash", action: "blocked" });
  await appendAuditEntry(cwd, { ts: new Date().toISOString(), extension: "safe-bash", action: "allowed-mutation" });
  await appendAuditEntry(cwd, { ts: new Date().toISOString(), extension: "safe-bash", action: "blocked" });

  const entries = await readAuditEntries(cwd, { action: "blocked" });
  assert.equal(entries.length, 2);
  for (const entry of entries) assert.equal(entry.action, "blocked");
});

test("readAuditEntries enforces the limit option", async () => {
  const cwd = await makeTempRepo("audit-log-limit-");
  for (let i = 0; i < 5; i += 1) {
    await appendAuditEntry(cwd, { ts: new Date().toISOString(), extension: "test", action: `a${i}` });
  }
  const entries = await readAuditEntries(cwd, { limit: 3 });
  assert.equal(entries.length, 3);
  // Insertion order — first 3
  assert.deepEqual(
    entries.map((entry) => entry.action),
    ["a0", "a1", "a2"],
  );
});

test("appendAuditEntry falls back to 'unknown' for missing extension/action (NOT NULL safety)", async () => {
  const cwd = await makeTempRepo("audit-log-fallback-");
  await appendAuditEntry(cwd, { ts: new Date().toISOString() } as unknown as { ts: string });
  const entries = await readAuditEntries(cwd);
  assert.equal(entries.length, 1);
  // payload_json round-trips with no synthetic extension/action injected.
  assert.equal(entries[0].extension, undefined);
});

test("appendAuditEntry preserves arbitrary payload fields via payload_json", async () => {
  const cwd = await makeTempRepo("audit-log-payload-");
  await appendAuditEntry(cwd, {
    ts: "2026-05-24T02:00:00.000Z",
    extension: "till-done",
    action: "task-update",
    reasons: ["one", "two"],
    metadata: { foo: 42, bar: null },
  });
  const entries = await readAuditEntries(cwd);
  assert.deepEqual((entries[0] as { reasons?: string[] }).reasons, ["one", "two"]);
  assert.deepEqual(
    (entries[0] as { metadata?: { foo?: number; bar?: null } }).metadata,
    { foo: 42, bar: null },
  );
});

test("multiple appends from one process are serialized cleanly in both stores", async () => {
  const cwd = await makeTempRepo("audit-log-serialized-");
  await Promise.all(
    Array.from({ length: 10 }).map((_, i) =>
      appendAuditEntry(cwd, {
        ts: new Date().toISOString(),
        extension: "load-test",
        action: `n${i}`,
      }),
    ),
  );
  const sqlite = await readAuditEntries(cwd);
  assert.equal(sqlite.length, 10);

  const jsonl = await readFile(join(cwd, AUDIT_LOG), "utf8");
  const lines = jsonl.trimEnd().split("\n");
  assert.equal(lines.length, 10);
  // Every line is parseable — no torn writes from concurrent appendFile.
  for (const line of lines) assert.doesNotThrow(() => JSON.parse(line));
});
