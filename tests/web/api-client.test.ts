import assert from "node:assert/strict";
import test from "node:test";

import { greenfieldOpenApiContract } from "../../services/api/src/contracts/openapi.ts";
import { createGreenfieldApiClient, ScaffoldApiError } from "../../apps/web/src/api/client.ts";
import { greenfieldApiEndpoints, type AuthSessionPlaceholder } from "../../apps/web/src/api/types.ts";

test("documented scaffold resources surface a deterministic not-ready error", async () => {
  const client = createGreenfieldApiClient({
    baseUrl: "https://greenfield.example.test",
    fetch: async (input) => {
      assert.equal(String(input), "https://greenfield.example.test/users");

      return new Response(JSON.stringify(greenfieldOpenApiContract.components.schemas.ErrorEnvelope.example), {
        status: 501,
        headers: {
          "content-type": "application/json",
        },
      });
    },
  });

  await assert.rejects(client.getUsers(), (error: unknown) => {
    assert.ok(error instanceof ScaffoldApiError);
    assert.equal(error.name, "ScaffoldApiError");
    assert.equal(error.code, greenfieldOpenApiContract.components.schemas.ErrorEnvelope.example.error);
    assert.equal(error.endpoint, greenfieldApiEndpoints.users);
    assert.equal(error.status, 501);
    assert.equal(error.queueReadiness, greenfieldOpenApiContract["x-greenfield-scaffold"].queueReadiness);
    assert.deepEqual(
      error.workerImplementationDependencies,
      greenfieldOpenApiContract["x-greenfield-scaffold"].workerImplementationDependencies,
    );
    assert.equal(error.message, "Scaffold resource /users is not implemented during Phase A materialization.");
    return true;
  });
});

test("auth session placeholder returns the documented contract payload", async () => {
  const expectedPayload: AuthSessionPlaceholder = greenfieldOpenApiContract.components.schemas.AuthSessionPlaceholder.example;
  const client = createGreenfieldApiClient({
    baseUrl: "https://greenfield.example.test",
    fetch: async (input) => {
      assert.equal(String(input), "https://greenfield.example.test/auth/session");

      return new Response(JSON.stringify(expectedPayload), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      });
    },
  });

  assert.deepEqual(await client.getAuthSession(), {
    ...expectedPayload,
    endpoint: greenfieldApiEndpoints.authSession,
  });
});
