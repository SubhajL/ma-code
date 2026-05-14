import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import test from "node:test";

import { fetchBackendHealth } from "../../apps/web/src/lib/health-client.ts";
import { createHealthRoute } from "../../services/api/src/routes/health.ts";

const issueSummaryUrl = new URL("../../docs/initiatives/greenfield-scaffold/slices/issue-004.summary.json", import.meta.url);

test("frontend health client can call the backend health route over HTTP", async (t) => {
  const route = createHealthRoute();
  const requests: Array<{ method: string | undefined; url: string | undefined; accept: string | undefined }> = [];
  const server = createServer((request, response) => {
    requests.push({
      method: request.method,
      url: request.url,
      accept: typeof request.headers.accept === "string" ? request.headers.accept : undefined,
    });

    if (request.method === route.method && request.url === route.path) {
      const routeResponse = route.handle();
      response.writeHead(routeResponse.status, routeResponse.headers);
      response.end(JSON.stringify(routeResponse.body));
      return;
    }

    response.writeHead(404, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ ok: false }));
  });

  t.after(() => server.close());

  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();
  assert.ok(address && typeof address === "object");

  const result = await fetchBackendHealth({
    baseUrl: `http://127.0.0.1:${address.port}`,
  });

  assert.deepEqual(result, {
    ok: true,
    service: "greenfield-api",
    endpoint: "/health",
  });

  assert.deepEqual(requests, [
    {
      method: "GET",
      url: "/health",
      accept: "application/json",
    },
  ]);
});

test("issue-004 remains phase-a bounded with queueReadiness not_ready", async () => {
  const summary = JSON.parse(await readFile(issueSummaryUrl, "utf8")) as {
    issueId: string;
    queueReadiness: string;
  };

  assert.equal(summary.issueId, "issue-004");
  assert.equal(summary.queueReadiness, "not_ready");
});
