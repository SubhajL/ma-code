import assert from "node:assert/strict";
import test from "node:test";

import { loadGreenfieldSmokePage } from "./helpers/greenfield.ts";

test("greenfield smoke loads the app shell over HTTP", async () => {
  const page = await loadGreenfieldSmokePage();

  assert.equal(page.status, 200);
  assert.match(page.html, /Greenfield scaffold/i);
  assert.match(page.html, /Placeholder route/i);
  assert.deepEqual(page.requests[0], {
    method: "GET",
    url: "/",
  });
});

test("greenfield smoke displays scaffold health on the loaded page", async () => {
  const page = await loadGreenfieldSmokePage();

  assert.match(page.html, /Backend health: greenfield-api \(ok\)/i);
  assert.deepEqual(page.requests.slice(0, 2).map(({ method, url }) => ({ method, url })), [
    {
      method: "GET",
      url: "/",
    },
    {
      method: "GET",
      url: "/health",
    },
  ]);
});

test("greenfield smoke shows a fixture-backed placeholder flow and keeps phase-a not_ready", async () => {
  const page = await loadGreenfieldSmokePage();

  assert.equal(page.issueSummary.issueId, "issue-014");
  assert.equal(page.issueSummary.queueReadiness, "not_ready");
  assert.ok(page.issueSummary.acceptanceCriteria.includes(
    "E2E smoke test covers app load, health display, and fixture-backed placeholder flow.",
  ));
  assert.match(page.html, /Auth session: unauthenticated placeholder/i);
  assert.match(page.html, /Queue readiness: not_ready/i);
  assert.match(page.html, /Fixture preview: 3 users, 3 projects/i);
  assert.match(page.html, /Test User 001/i);
  assert.match(page.html, /Local Sandbox Alpha/i);
  assert.match(page.html, /\/users -> not_implemented/i);
  assert.match(page.html, /\/projects -> not_implemented/i);
  assert.deepEqual(page.requests.map(({ method, url }) => ({ method, url })), [
    {
      method: "GET",
      url: "/",
    },
    {
      method: "GET",
      url: "/health",
    },
    {
      method: "GET",
      url: "/auth/session",
    },
    {
      method: "GET",
      url: "/users",
    },
    {
      method: "GET",
      url: "/projects",
    },
  ]);
});
