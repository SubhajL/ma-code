import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  greenfieldPersistencePlaceholder,
  validatePersistenceRecord,
} from "../../services/api/src/db/schema.ts";

const schemaUrl = new URL("../../schemas/greenfield/user.schema.json", import.meta.url);

test("public persistence placeholder schema includes user and project record definitions", async () => {
  const schema = JSON.parse(await readFile(schemaUrl, "utf8")) as {
    oneOf: Array<{ $ref: string }>;
    $defs: {
      userRecord: { required: string[] };
      projectRecord: { required: string[] };
    };
  };

  assert.deepEqual(schema.oneOf, [{ $ref: "#/$defs/userRecord" }, { $ref: "#/$defs/projectRecord" }]);
  assert.deepEqual(schema.$defs.userRecord.required, ["kind", "id", "email", "displayName", "createdAt"]);
  assert.deepEqual(schema.$defs.projectRecord.required, ["kind", "id", "ownerUserId", "slug", "name", "createdAt"]);
});

test("placeholder metadata stays phase-a bounded while validating user and project records", () => {
  assert.equal(greenfieldPersistencePlaceholder.queueReadiness, "not_ready");
  assert.equal(greenfieldPersistencePlaceholder.requiresMigrations, false);
  assert.deepEqual(
    greenfieldPersistencePlaceholder.workerImplementationDependencies.map((dependency) => dependency.issueId),
    ["issue-010", "issue-013"],
  );

  assert.deepEqual(
    validatePersistenceRecord({
      kind: "user",
      id: "user-001",
      email: "user-001@example.com",
      displayName: "User 001",
      createdAt: "2026-05-12T00:00:00.000Z",
    }),
    { valid: true, errors: [], recordKind: "user" },
  );

  assert.deepEqual(
    validatePersistenceRecord({
      kind: "project",
      id: "project-001",
      ownerUserId: "user-001",
      slug: "project-001",
      name: "Project 001",
      createdAt: "2026-05-12T00:00:00.000Z",
    }),
    { valid: true, errors: [], recordKind: "project" },
  );
});

test("placeholder validation rejects incomplete records without requiring migrations", () => {
  assert.deepEqual(validatePersistenceRecord({ kind: "user", id: "user-001", displayName: "User 001" }), {
    valid: false,
    errors: [
      "user.email must be a non-empty email string",
      "user.createdAt must be an ISO-8601 date-time string",
    ],
    recordKind: "user",
  });

  assert.deepEqual(
    validatePersistenceRecord({
      kind: "project",
      id: "project-001",
      ownerUserId: "user-001",
      name: "Project 001",
      createdAt: "2026-05-12T00:00:00.000Z",
    }),
    {
      valid: false,
      errors: ["project.slug must be a lower-case slug string"],
      recordKind: "project",
    },
  );
});
