import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  AUDIT_LOG,
  appendAuditEntry,
  formatAuditLogRotationTimestamp,
  pruneRotatedAuditLogs,
  readAuditEntries,
  resolveAuditLogRotationConfig,
} from "../../.pi/agent/extensions/lib/audit-log.ts";
import { makeTempRepo } from "./test-utils.ts";

function setRotationEnv(values: Partial<{ maxBytes: string; retain: string }>): () => void {
  const priorMax = process.env.HARNESS_AUDIT_LOG_MAX_BYTES;
  const priorRetain = process.env.HARNESS_AUDIT_LOG_RETAIN;
  if (values.maxBytes !== undefined) process.env.HARNESS_AUDIT_LOG_MAX_BYTES = values.maxBytes;
  if (values.retain !== undefined) process.env.HARNESS_AUDIT_LOG_RETAIN = values.retain;
  return () => {
    if (priorMax === undefined) delete process.env.HARNESS_AUDIT_LOG_MAX_BYTES;
    else process.env.HARNESS_AUDIT_LOG_MAX_BYTES = priorMax;
    if (priorRetain === undefined) delete process.env.HARNESS_AUDIT_LOG_RETAIN;
    else process.env.HARNESS_AUDIT_LOG_RETAIN = priorRetain;
  };
}

async function listRotatedFiles(cwd: string): Promise<string[]> {
  const logDir = dirname(join(cwd, AUDIT_LOG));
  const baseName = AUDIT_LOG.split("/").pop()!;
  try {
    const entries = await readdir(logDir);
    return entries.filter((name) => name.startsWith(`${baseName}.`)).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

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

test("resolveAuditLogRotationConfig uses defaults when env vars are unset", () => {
  const config = resolveAuditLogRotationConfig({});
  assert.equal(config.maxBytes, 5_000_000);
  assert.equal(config.retain, 5);
});

test("resolveAuditLogRotationConfig honours HARNESS_AUDIT_LOG_MAX_BYTES (including 0 to disable)", () => {
  assert.equal(resolveAuditLogRotationConfig({ HARNESS_AUDIT_LOG_MAX_BYTES: "1024" }).maxBytes, 1024);
  assert.equal(resolveAuditLogRotationConfig({ HARNESS_AUDIT_LOG_MAX_BYTES: "0" }).maxBytes, 0);
  // Invalid → fallback default
  assert.equal(resolveAuditLogRotationConfig({ HARNESS_AUDIT_LOG_MAX_BYTES: "not-a-number" }).maxBytes, 5_000_000);
  assert.equal(resolveAuditLogRotationConfig({ HARNESS_AUDIT_LOG_MAX_BYTES: "-1" }).maxBytes, 5_000_000);
});

test("resolveAuditLogRotationConfig honours HARNESS_AUDIT_LOG_RETAIN", () => {
  assert.equal(resolveAuditLogRotationConfig({ HARNESS_AUDIT_LOG_RETAIN: "3" }).retain, 3);
  assert.equal(resolveAuditLogRotationConfig({ HARNESS_AUDIT_LOG_RETAIN: "0" }).retain, 0);
  // Invalid → fallback default
  assert.equal(resolveAuditLogRotationConfig({ HARNESS_AUDIT_LOG_RETAIN: "abc" }).retain, 5);
  assert.equal(resolveAuditLogRotationConfig({ HARNESS_AUDIT_LOG_RETAIN: "-2" }).retain, 5);
});

test("formatAuditLogRotationTimestamp produces sortable UTC millisecond timestamp", () => {
  const ts = formatAuditLogRotationTimestamp(new Date("2026-05-27T14:30:12.123Z"));
  assert.match(ts, /^\d{8}T\d{9}Z$/);
  assert.equal(ts, "20260527T143012123Z");
  // Lexical sort = chronological
  const a = formatAuditLogRotationTimestamp(new Date("2026-05-27T14:30:12.123Z"));
  const b = formatAuditLogRotationTimestamp(new Date("2026-05-27T14:30:12.124Z"));
  const c = formatAuditLogRotationTimestamp(new Date("2026-05-27T14:30:13.000Z"));
  assert.deepEqual([c, a, b].sort(), [a, b, c]);
});

test("appendAuditEntry rotates JSONL when active file would exceed maxBytes", async () => {
  const cwd = await makeTempRepo("audit-log-rotate-");
  const restore = setRotationEnv({ maxBytes: "200" });
  try {
    for (const action of ["alpha", "beta", "gamma"]) {
      await appendAuditEntry(cwd, {
        ts: new Date().toISOString(),
        extension: "rotate-test",
        action,
        padding: "x".repeat(120),
      });
    }
    const rotated = await listRotatedFiles(cwd);
    assert.ok(rotated.length >= 1, `expected at least 1 rotated file, got ${rotated.length}`);
    // Active file should hold only the latest entry (or the latest few since rotation).
    const active = await readFile(join(cwd, AUDIT_LOG), "utf8");
    const activeLines = active.trimEnd().split("\n").filter((l) => l.length > 0);
    assert.ok(activeLines.length >= 1);
    const lastEntry = JSON.parse(activeLines[activeLines.length - 1]);
    assert.equal(lastEntry.action, "gamma");
  } finally {
    restore();
  }
});

test("appendAuditEntry preserves SQLite entries across rotation", async () => {
  const cwd = await makeTempRepo("audit-log-rotate-sqlite-");
  const restore = setRotationEnv({ maxBytes: "200" });
  try {
    for (const action of ["a", "b", "c", "d"]) {
      await appendAuditEntry(cwd, {
        ts: new Date().toISOString(),
        extension: "sqlite-parity",
        action,
        padding: "y".repeat(120),
      });
    }
    const entries = await readAuditEntries(cwd);
    assert.deepEqual(
      entries.map((entry) => entry.action),
      ["a", "b", "c", "d"],
    );
  } finally {
    restore();
  }
});

test("pruneRotatedAuditLogs keeps the newest retain rotations", async () => {
  const cwd = await makeTempRepo("audit-log-prune-");
  const logDir = dirname(join(cwd, AUDIT_LOG));
  await mkdir(logDir, { recursive: true });
  const baseName = AUDIT_LOG.split("/").pop()!;
  const timestamps = [
    "20260101T000000000Z",
    "20260102T000000000Z",
    "20260103T000000000Z",
    "20260104T000000000Z",
    "20260105T000000000Z",
    "20260106T000000000Z",
    "20260107T000000000Z",
  ];
  for (const ts of timestamps) {
    await writeFile(join(logDir, `${baseName}.${ts}`), "{}\n", "utf8");
  }

  await pruneRotatedAuditLogs(cwd, 3);

  const remaining = await listRotatedFiles(cwd);
  assert.equal(remaining.length, 3);
  assert.deepEqual(
    remaining,
    [
      `${baseName}.20260105T000000000Z`,
      `${baseName}.20260106T000000000Z`,
      `${baseName}.20260107T000000000Z`,
    ],
  );
});

test("appendAuditEntry tolerates rotation when log file does not yet exist", async () => {
  const cwd = await makeTempRepo("audit-log-fresh-");
  const restore = setRotationEnv({ maxBytes: "200" });
  try {
    await appendAuditEntry(cwd, {
      ts: new Date().toISOString(),
      extension: "fresh",
      action: "first-ever",
    });
    assert.equal(existsSync(join(cwd, AUDIT_LOG)), true);
    const rotated = await listRotatedFiles(cwd);
    assert.equal(rotated.length, 0);
  } finally {
    restore();
  }
});

test("appendAuditEntry does not rotate when HARNESS_AUDIT_LOG_MAX_BYTES is 0", async () => {
  const cwd = await makeTempRepo("audit-log-disabled-");
  const restore = setRotationEnv({ maxBytes: "0" });
  try {
    for (let i = 0; i < 10; i += 1) {
      await appendAuditEntry(cwd, {
        ts: new Date().toISOString(),
        extension: "rotation-disabled",
        action: `n${i}`,
        padding: "z".repeat(500),
      });
    }
    const rotated = await listRotatedFiles(cwd);
    assert.equal(rotated.length, 0, "rotation must be disabled when maxBytes=0");
    const jsonl = await readFile(join(cwd, AUDIT_LOG), "utf8");
    const lines = jsonl.trimEnd().split("\n");
    assert.equal(lines.length, 10);
  } finally {
    restore();
  }
});

test("single oversized entry is written without splitting", async () => {
  const cwd = await makeTempRepo("audit-log-oversized-");
  const restore = setRotationEnv({ maxBytes: "100" });
  try {
    await appendAuditEntry(cwd, {
      ts: new Date().toISOString(),
      extension: "oversized",
      action: "huge",
      padding: "Q".repeat(5000),
    });
    const jsonl = await readFile(join(cwd, AUDIT_LOG), "utf8");
    const lines = jsonl.trimEnd().split("\n");
    assert.equal(lines.length, 1, "oversize entry should land as one unsplit line");
    const parsed = JSON.parse(lines[0]);
    assert.equal(parsed.action, "huge");
    assert.equal((parsed as { padding: string }).padding.length, 5000);
  } finally {
    restore();
  }
});

test("concurrent appends within one process serialize without torn rotation lines", async () => {
  const cwd = await makeTempRepo("audit-log-concurrent-rotate-");
  // Set retain high so the test can verify all entries survive rotation
  // (default retain=5 would prune older rotated files mid-test).
  const restore = setRotationEnv({ maxBytes: "300", retain: "100" });
  try {
    await Promise.all(
      Array.from({ length: 10 }).map((_, i) =>
        appendAuditEntry(cwd, {
          ts: new Date().toISOString(),
          extension: "concurrent-rotate",
          action: `n${i}`,
          padding: "w".repeat(120),
        }),
      ),
    );

    const sqlite = await readAuditEntries(cwd);
    assert.equal(sqlite.length, 10);

    const rotated = await listRotatedFiles(cwd);
    const allFiles = [...rotated.map((name) => join(dirname(join(cwd, AUDIT_LOG)), name)), join(cwd, AUDIT_LOG)];
    let parsedCount = 0;
    for (const file of allFiles) {
      if (!existsSync(file)) continue;
      const content = await readFile(file, "utf8");
      const lines = content.trimEnd().split("\n").filter((l) => l.length > 0);
      for (const line of lines) {
        assert.doesNotThrow(() => JSON.parse(line), `line in ${file} should parse: ${line.slice(0, 60)}`);
        parsedCount += 1;
      }
    }
    assert.equal(parsedCount, 10, "all 10 entries should be present across active + rotated files");
  } finally {
    restore();
  }
});
