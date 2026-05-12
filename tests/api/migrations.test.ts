import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  greenfieldMigrationScaffold,
  listGreenfieldMigrations,
  validateGreenfieldMigrationScaffold,
} from "../../services/api/src/db/migrations.ts";

const issueSummaryUrl = new URL("../../docs/initiatives/greenfield-scaffold/slices/issue-010.summary.json", import.meta.url);
const migrationFileUrl = new URL("../../migrations/0001_greenfield_init.sql", import.meta.url);

test("migration scaffold is listed as a phase-a bounded slice", async () => {
  const summary = JSON.parse(await readFile(issueSummaryUrl, "utf8")) as {
    queueReadiness: string;
    validationProof: string[];
  };

  assert.equal(summary.queueReadiness, "not_ready");
  assert.deepEqual(summary.validationProof, ["npm run test:api -- migrations"]);

  assert.deepEqual(listGreenfieldMigrations(), [greenfieldMigrationScaffold]);
  assert.equal(greenfieldMigrationScaffold.queueReadiness, "not_ready");
  assert.equal(greenfieldMigrationScaffold.appliesToProductionData, false);
  assert.deepEqual(
    greenfieldMigrationScaffold.workerImplementationDependencies.map((dependency) => dependency.issueId),
    ["issue-013"],
  );
});

test("migration scaffold SQL stays rollback-only and validates without applying production data", async () => {
  const sql = await readFile(migrationFileUrl, "utf8");
  const validation = validateGreenfieldMigrationScaffold();

  assert.match(sql, /^-- greenfield-scaffold migration: 0001_greenfield_init$/m);
  assert.match(sql, /^-- queue-readiness: not_ready$/m);
  assert.match(sql, /^-- apply-mode: validate_only$/m);
  assert.match(sql, /^BEGIN;$/m);
  assert.match(sql, /^CREATE TABLE IF NOT EXISTS greenfield_users \($/m);
  assert.match(sql, /^CREATE TABLE IF NOT EXISTS greenfield_projects \($/m);
  assert.match(sql, /^ROLLBACK;$/m);
  assert.doesNotMatch(sql, /^COMMIT;$/m);

  assert.deepEqual(validation, {
    migrationId: "0001_greenfield_init",
    filePath: "migrations/0001_greenfield_init.sql",
    valid: true,
    errors: [],
  });
});
