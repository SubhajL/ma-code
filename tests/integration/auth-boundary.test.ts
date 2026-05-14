import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { describeAuthSessionBoundary as describeApiAuthSessionBoundary, getAuthSession as getApiAuthSession } from "../../services/api/src/auth/session.ts";
import { describeAuthSessionBoundary as describeWebAuthSessionBoundary, getAuthSession as getWebAuthSession } from "../../apps/web/src/auth/session.ts";

const issueSummaryUrl = new URL("../../docs/initiatives/greenfield-scaffold/slices/issue-008.summary.json", import.meta.url);

test("api auth placeholder stays unauthenticated and keeps config outside source", async () => {
  const first = getApiAuthSession();
  const second = getApiAuthSession();

  assert.deepEqual(first, {
    status: "unauthenticated",
    actorId: null,
    authMode: "placeholder",
  });
  assert.deepEqual(second, first);
  assert.notStrictEqual(second, first);

  assert.deepEqual(describeApiAuthSessionBoundary(), {
    authMode: "placeholder",
    configSource: "runtime",
    sessionPersistence: "disabled",
  });

  const source = await readFile(new URL("../../services/api/src/auth/session.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /process\.env|import\.meta\.env/);
});

test("web auth placeholder mirrors the unauthenticated boundary and issue-008 stays not_ready", async () => {
  assert.deepEqual(getWebAuthSession(), {
    status: "unauthenticated",
    actorId: null,
    authMode: "placeholder",
  });

  assert.deepEqual(describeWebAuthSessionBoundary(), {
    authMode: "placeholder",
    configSource: "runtime",
    sessionPersistence: "disabled",
  });

  const webSource = await readFile(new URL("../../apps/web/src/auth/session.ts", import.meta.url), "utf8");
  assert.doesNotMatch(webSource, /process\.env|import\.meta\.env/);

  const summary = JSON.parse(await readFile(issueSummaryUrl, "utf8")) as {
    issueId: string;
    queueReadiness: string;
  };

  assert.equal(summary.issueId, "issue-008");
  assert.equal(summary.queueReadiness, "not_ready");
});
