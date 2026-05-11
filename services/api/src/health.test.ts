import assert from "node:assert/strict";
import test from "node:test";

import { createServerEntry } from "./server.ts";

test("backend shell exposes a health check through the server entrypoint", () => {
  const entry = createServerEntry();
  assert.equal(entry.healthPath, "/health");
  assert.deepEqual(entry.handleHealth(), {
    status: 200,
    body: { ok: true, service: "greenfield-api" },
  });
});
