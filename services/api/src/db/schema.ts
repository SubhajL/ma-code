import { readFileSync } from "node:fs";

import type { GreenfieldPersistencePlaceholderSchema } from "../../../../schemas/greenfield/user.types.generated.ts";

export type GreenfieldPersistenceRecord = GreenfieldPersistencePlaceholderSchema;
export type GreenfieldPersistenceRecordKind = GreenfieldPersistenceRecord["kind"];

export interface WorkerImplementationDependency {
  issueId: "issue-010" | "issue-013";
  reason: string;
}

export interface GreenfieldPersistencePlaceholder {
  queueReadiness: "not_ready";
  requiresMigrations: false;
  schemaPath: "schemas/greenfield/user.schema.json";
  supportedRecordKinds: readonly GreenfieldPersistenceRecordKind[];
  workerImplementationDependencies: readonly WorkerImplementationDependency[];
}

export interface GreenfieldPersistenceSchemaDocument {
  $schema: string;
  $id: string;
  title: string;
  description: string;
  type: "object";
  oneOf: Array<{ $ref: string }>;
  $defs: Record<string, unknown>;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  recordKind?: GreenfieldPersistenceRecordKind;
}

const ISO_8601_UTC_MILLIS_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const PROJECT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const greenfieldPersistenceSchemaUrl = new URL("../../../../schemas/greenfield/user.schema.json", import.meta.url);

export const greenfieldPersistenceSchema = JSON.parse(
  readFileSync(greenfieldPersistenceSchemaUrl, "utf8"),
) as GreenfieldPersistenceSchemaDocument;

export const greenfieldPersistencePlaceholder: GreenfieldPersistencePlaceholder = {
  queueReadiness: "not_ready",
  requiresMigrations: false,
  schemaPath: "schemas/greenfield/user.schema.json",
  supportedRecordKinds: ["user", "project"],
  workerImplementationDependencies: [
    {
      issueId: "issue-010",
      reason: "Phase B adds the first migration scaffold; this placeholder intentionally validates records before migrations exist.",
    },
    {
      issueId: "issue-013",
      reason: "Fixture and seed work should consume the same user/project placeholder shapes once deterministic records are added.",
    },
  ],
};

export function validatePersistenceRecord(record: unknown): ValidationResult {
  if (!isPlainObject(record)) {
    return {
      valid: false,
      errors: ["record must be an object"],
    };
  }

  const kind = record.kind;
  if (kind !== "user" && kind !== "project") {
    return {
      valid: false,
      errors: ["record.kind must be either \"user\" or \"project\""],
    };
  }

  const errors = kind === "user" ? validateUserRecord(record) : validateProjectRecord(record);
  return {
    valid: errors.length === 0,
    errors,
    recordKind: kind,
  };
}

function validateUserRecord(record: Record<string, unknown>): string[] {
  const errors: string[] = [];

  if (!isNonEmptyString(record.id)) {
    errors.push("user.id must be a non-empty string");
  }
  if (!isEmail(record.email)) {
    errors.push("user.email must be a non-empty email string");
  }
  if (!isNonEmptyString(record.displayName)) {
    errors.push("user.displayName must be a non-empty string");
  }
  if (!isIsoDateTime(record.createdAt)) {
    errors.push("user.createdAt must be an ISO-8601 date-time string");
  }

  return errors;
}

function validateProjectRecord(record: Record<string, unknown>): string[] {
  const errors: string[] = [];

  if (!isNonEmptyString(record.id)) {
    errors.push("project.id must be a non-empty string");
  }
  if (!isNonEmptyString(record.ownerUserId)) {
    errors.push("project.ownerUserId must be a non-empty string");
  }
  if (!isSlug(record.slug)) {
    errors.push("project.slug must be a lower-case slug string");
  }
  if (!isNonEmptyString(record.name)) {
    errors.push("project.name must be a non-empty string");
  }
  if (!isIsoDateTime(record.createdAt)) {
    errors.push("project.createdAt must be an ISO-8601 date-time string");
  }

  return errors;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isEmail(value: unknown): value is string {
  return isNonEmptyString(value) && value.includes("@") && value.includes(".");
}

function isSlug(value: unknown): value is string {
  return isNonEmptyString(value) && PROJECT_SLUG_PATTERN.test(value);
}

function isIsoDateTime(value: unknown): value is string {
  return typeof value === "string" && ISO_8601_UTC_MILLIS_PATTERN.test(value);
}
