import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  generateTypeModuleFromSchema,
  SCHEMA_TYPE_OUTPUTS,
} from "../../scripts/codegen-schema-types.ts";
import type {
  GreenfieldPersistencePlaceholderSchema,
  ProjectRecord,
  UserRecord,
} from "../../schemas/greenfield/user.types.generated.ts";

const greenfieldSchemaOutput = SCHEMA_TYPE_OUTPUTS.find(
  (output) => output.schemaPath === "schemas/greenfield/user.schema.json",
);

test("generates deterministic TypeScript types from the Greenfield JSON schema", async () => {
  assert.ok(greenfieldSchemaOutput, "Greenfield schema output must be configured");

  const schema = JSON.parse(await readFile(greenfieldSchemaOutput.schemaPath, "utf8")) as unknown;
  const generated = generateTypeModuleFromSchema(schema, greenfieldSchemaOutput);

  assert.match(generated, /Generated from schemas\/greenfield\/user\.schema\.json/);
  assert.match(generated, /export type GreenfieldPersistencePlaceholderSchema = UserRecord \| ProjectRecord;/);
  assert.match(generated, /export interface UserRecord/);
  assert.match(generated, /readonly kind: "user";/);
  assert.match(generated, /export interface ProjectRecord/);
  assert.match(generated, /readonly ownerUserId: Identifier;/);
});

test("checked-in generated schema types are current", async () => {
  assert.ok(greenfieldSchemaOutput, "Greenfield schema output must be configured");

  const schema = JSON.parse(await readFile(greenfieldSchemaOutput.schemaPath, "utf8")) as unknown;
  const generated = generateTypeModuleFromSchema(schema, greenfieldSchemaOutput);
  const checkedIn = await readFile(greenfieldSchemaOutput.outputPath, "utf8");

  assert.equal(checkedIn, generated);
});

test("generated persistence record types are consumable by API code", () => {
  const user: UserRecord = {
    kind: "user",
    id: "user-001",
    email: "user-001@example.com",
    displayName: "User 001",
    createdAt: "2026-05-12T00:00:00.000Z",
  };
  const project: ProjectRecord = {
    kind: "project",
    id: "project-001",
    ownerUserId: "user-001",
    slug: "project-001",
    name: "Project 001",
    createdAt: "2026-05-12T00:00:00.000Z",
  };

  const records: GreenfieldPersistencePlaceholderSchema[] = [user, project];

  assert.deepEqual(
    records.map((record) => record.kind),
    ["user", "project"],
  );
});
