import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createHealthRoute } from "../../services/api/src/routes/health.ts";
import { greenfieldPersistencePlaceholder } from "../../services/api/src/db/schema.ts";
import {
  greenfieldOpenApiContract,
  stringifyGreenfieldOpenApiContract,
} from "../../services/api/src/contracts/openapi.ts";

const contractArtifactUrl = new URL(
  "../../docs/initiatives/greenfield-scaffold/contracts/api.contract.json",
  import.meta.url,
);
const issueSummaryUrl = new URL("../../docs/initiatives/greenfield-scaffold/slices/issue-011.summary.json", import.meta.url);

test("API contract artifact stays phase-a bounded while documenting health, auth placeholder, and scaffold resources", async () => {
  const issueSummary = JSON.parse(await readFile(issueSummaryUrl, "utf8")) as {
    queueReadiness: string;
    validationProof: string[];
  };
  const contractArtifact = JSON.parse(await readFile(contractArtifactUrl, "utf8")) as typeof greenfieldOpenApiContract;
  const healthRoute = createHealthRoute();

  assert.equal(issueSummary.queueReadiness, "not_ready");
  assert.deepEqual(issueSummary.validationProof, ["npm run test:api -- contracts"]);

  assert.equal(contractArtifact["x-greenfield-scaffold"].queueReadiness, "not_ready");
  assert.deepEqual(
    contractArtifact["x-greenfield-scaffold"].documentedResourceKinds,
    greenfieldPersistencePlaceholder.supportedRecordKinds,
  );
  assert.deepEqual(
    contractArtifact["x-greenfield-scaffold"].workerImplementationDependencies.map((dependency) => dependency.issueId),
    ["issue-008", "issue-012"],
  );

  assert.equal(contractArtifact.paths[healthRoute.path].get.operationId, "getHealth");
  assert.equal(contractArtifact.paths["/auth/session"].get["x-scaffoldStatus"], "planned_placeholder");
  assert.equal(contractArtifact.paths["/users"].get["x-scaffoldStatus"], "planned_resource");
  assert.equal(contractArtifact.paths["/projects"].get["x-scaffoldStatus"], "planned_resource");
});

test("TypeScript OpenAPI export matches the public contract artifact and placeholder schemas", async () => {
  const contractFile = await readFile(contractArtifactUrl, "utf8");
  const contractArtifact = JSON.parse(contractFile) as typeof greenfieldOpenApiContract;

  assert.equal(stringifyGreenfieldOpenApiContract(), contractFile);
  assert.deepEqual(greenfieldOpenApiContract, contractArtifact);

  const healthRoute = createHealthRoute();

  assert.equal(greenfieldOpenApiContract.components.securitySchemes.sessionCookie.type, "apiKey");
  assert.deepEqual(greenfieldOpenApiContract.components.schemas.AuthSessionPlaceholder.example, {
    authenticated: false,
    actor: null,
  });
  assert.deepEqual(greenfieldOpenApiContract.components.schemas.HealthPayload.required, ["ok", "service"]);
  assert.equal(
    greenfieldOpenApiContract.components.schemas.HealthPayload.properties.ok.const,
    healthRoute.handle().body.ok,
  );
  assert.equal(
    greenfieldOpenApiContract.components.schemas.HealthPayload.properties.service.const,
    healthRoute.handle().body.service,
  );
  assert.equal(
    greenfieldOpenApiContract.components.schemas.UserRecord["x-schemaPath"],
    greenfieldPersistencePlaceholder.schemaPath,
  );
  assert.equal(
    greenfieldOpenApiContract.components.schemas.ProjectRecord["x-schemaPath"],
    greenfieldPersistencePlaceholder.schemaPath,
  );
  assert.equal(
    greenfieldOpenApiContract.paths["/users"].get.responses["200"].content["application/json"].schema.items.$ref,
    "#/components/schemas/UserRecord",
  );
  assert.equal(
    greenfieldOpenApiContract.paths["/projects"].get.responses["200"].content["application/json"].schema.items.$ref,
    "#/components/schemas/ProjectRecord",
  );
});
