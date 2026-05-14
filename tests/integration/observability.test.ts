import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createClientLogger } from "../../apps/web/src/observability/client-logger.ts";
import { createLogger } from "../../services/api/src/observability/logger.ts";

const issueSummaryUrl = new URL("../../docs/initiatives/greenfield-scaffold/slices/issue-015.summary.json", import.meta.url);

const REDACTED = "[REDACTED]";

test("observability scaffold emits structured local/test logs without secrets", async () => {
  const apiLines: string[] = [];
  const apiLogger = createLogger({
    environment: "test",
    now: () => new Date("2026-05-14T09:04:00.000Z"),
    write: (line) => {
      apiLines.push(line);
    },
  });

  const apiRecord = apiLogger.info("request.completed", {
    requestId: "req-1",
    token: "super-secret-token",
    nested: {
      password: "swordfish",
      ok: true,
    },
    headers: {
      authorization: "Bearer top-secret",
      "x-trace-id": "trace-1",
    },
    sessionCookie: "session=abc123",
    count: 2,
    flags: ["safe", { apiKey: "key-123" }],
  });

  assert.equal(apiLines.length, 1);
  assert.deepEqual(apiRecord, {
    timestamp: "2026-05-14T09:04:00.000Z",
    runtime: "api",
    environment: "test",
    level: "info",
    event: "request.completed",
    data: {
      requestId: "req-1",
      token: REDACTED,
      nested: {
        password: REDACTED,
        ok: true,
      },
      headers: {
        authorization: REDACTED,
        "x-trace-id": "trace-1",
      },
      sessionCookie: REDACTED,
      count: 2,
      flags: ["safe", { apiKey: REDACTED }],
    },
  });
  assert.deepEqual(JSON.parse(apiLines[0] ?? "{}"), apiRecord);
  assert.doesNotMatch(apiLines[0] ?? "", /super-secret-token|swordfish|top-secret|session=abc123|key-123/);

  const clientLines: string[] = [];
  const clientLogger = createClientLogger({
    environment: "local",
    now: () => new Date("2026-05-14T09:04:01.000Z"),
    write: (line) => {
      clientLines.push(line);
    },
  });

  const clientRecord = clientLogger.warn("ui.retry", {
    view: "dashboard",
    authorization: "Bearer browser-secret",
    retryCount: 1,
  });

  assert.equal(clientLines.length, 1);
  assert.deepEqual(clientRecord, {
    timestamp: "2026-05-14T09:04:01.000Z",
    runtime: "web",
    environment: "local",
    level: "warn",
    event: "ui.retry",
    data: {
      view: "dashboard",
      authorization: REDACTED,
      retryCount: 1,
    },
  });
  assert.deepEqual(JSON.parse(clientLines[0] ?? "{}"), clientRecord);
  assert.doesNotMatch(clientLines[0] ?? "", /browser-secret/);

  const [apiSource, clientSource] = await Promise.all([
    readFile(new URL("../../services/api/src/observability/logger.ts", import.meta.url), "utf8"),
    readFile(new URL("../../apps/web/src/observability/client-logger.ts", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(apiSource, /process\.env|import\.meta\.env/);
  assert.doesNotMatch(clientSource, /process\.env|import\.meta\.env/);
});

test("issue-015 remains phase-a bounded with queueReadiness not_ready", async () => {
  const summary = JSON.parse(await readFile(issueSummaryUrl, "utf8")) as {
    issueId: string;
    queueReadiness: string;
  };

  assert.equal(summary.issueId, "issue-015");
  assert.equal(summary.queueReadiness, "not_ready");
});
