import { readFileSync } from "node:fs";

import type { WorkerImplementationDependency } from "./schema.ts";

export interface GreenfieldMigrationScaffold {
  id: "0001_greenfield_init";
  filePath: "migrations/0001_greenfield_init.sql";
  queueReadiness: "not_ready";
  appliesToProductionData: false;
  workerImplementationDependencies: readonly WorkerImplementationDependency[];
}

export interface MigrationScaffoldValidationResult {
  migrationId: GreenfieldMigrationScaffold["id"];
  filePath: GreenfieldMigrationScaffold["filePath"];
  valid: boolean;
  errors: string[];
}

export const greenfieldMigrationScaffoldUrl = new URL("../../../../migrations/0001_greenfield_init.sql", import.meta.url);

export const greenfieldMigrationScaffold: GreenfieldMigrationScaffold = {
  id: "0001_greenfield_init",
  filePath: "migrations/0001_greenfield_init.sql",
  queueReadiness: "not_ready",
  appliesToProductionData: false,
  workerImplementationDependencies: [
    {
      issueId: "issue-013",
      reason: "Deterministic seed fixtures should target the first migration scaffold after local/test-only records are added.",
    },
  ],
};

const REQUIRED_SQL_SNIPPETS: Array<[label: string, pattern: RegExp]> = [
  ["migration header", /^-- greenfield-scaffold migration: 0001_greenfield_init$/m],
  ["queue readiness marker", /^-- queue-readiness: not_ready$/m],
  ["validate-only marker", /^-- apply-mode: validate_only$/m],
  ["transaction start", /^BEGIN;$/m],
  ["user table scaffold", /^CREATE TABLE IF NOT EXISTS greenfield_users \($/m],
  ["project table scaffold", /^CREATE TABLE IF NOT EXISTS greenfield_projects \($/m],
  ["rollback guard", /^ROLLBACK;$/m],
];

export function listGreenfieldMigrations(): readonly GreenfieldMigrationScaffold[] {
  return [greenfieldMigrationScaffold];
}

export function readGreenfieldMigrationScaffold(): string {
  return readFileSync(greenfieldMigrationScaffoldUrl, "utf8");
}

export function validateGreenfieldMigrationScaffold(): MigrationScaffoldValidationResult {
  const sql = readGreenfieldMigrationScaffold();
  const errors = REQUIRED_SQL_SNIPPETS.filter(([, pattern]) => !pattern.test(sql)).map(([label]) => {
    return `missing ${label}`;
  });

  if (/^COMMIT;$/m.test(sql)) {
    errors.push("commit statements are not allowed in validate-only scaffold migrations");
  }

  return {
    migrationId: greenfieldMigrationScaffold.id,
    filePath: greenfieldMigrationScaffold.filePath,
    valid: errors.length === 0,
    errors,
  };
}
