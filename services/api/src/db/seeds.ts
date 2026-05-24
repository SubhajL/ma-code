import { readFileSync } from "node:fs";

import type {
  GreenfieldPersistencePlaceholderSchema,
  ProjectRecord,
  UserRecord,
} from "../../../../schemas/greenfield/user.types.generated.ts";
import { validatePersistenceRecord } from "./schema.ts";

export type GreenfieldSeedUserRecord = UserRecord;
export type GreenfieldSeedProjectRecord = ProjectRecord;
export type GreenfieldSeedRecord = GreenfieldPersistencePlaceholderSchema;

export interface GreenfieldSeedWorkerImplementationDependency {
  issueId: "issue-014";
  reason: string;
}

export interface GreenfieldSeedScaffold {
  queueReadiness: "not_ready";
  appliesToProductionData: false;
  environment: "local_test_only";
  userFixturePath: "tests/fixtures/greenfield/users.json";
  projectFixturePath: "tests/fixtures/greenfield/projects.json";
  workerImplementationDependencies: readonly GreenfieldSeedWorkerImplementationDependency[];
}

export interface GreenfieldSeedValidationResult {
  valid: boolean;
  errors: string[];
  userCount: number;
  projectCount: number;
}

export const greenfieldSeedUsersUrl = new URL("../../../../tests/fixtures/greenfield/users.json", import.meta.url);
export const greenfieldSeedProjectsUrl = new URL("../../../../tests/fixtures/greenfield/projects.json", import.meta.url);

export const greenfieldSeedScaffold: GreenfieldSeedScaffold = {
  queueReadiness: "not_ready",
  appliesToProductionData: false,
  environment: "local_test_only",
  userFixturePath: "tests/fixtures/greenfield/users.json",
  projectFixturePath: "tests/fixtures/greenfield/projects.json",
  workerImplementationDependencies: [
    {
      issueId: "issue-014",
      reason: "The smoke scaffold should consume deterministic fixture-backed placeholder data before any Phase B queue-ready seed application exists.",
    },
  ],
};

export function readGreenfieldSeedUsers(): readonly GreenfieldSeedUserRecord[] {
  return readSeedFixture<GreenfieldSeedUserRecord>(greenfieldSeedUsersUrl, "user");
}

export function readGreenfieldSeedProjects(): readonly GreenfieldSeedProjectRecord[] {
  return readSeedFixture<GreenfieldSeedProjectRecord>(greenfieldSeedProjectsUrl, "project");
}

export function listGreenfieldSeedRecords(): readonly GreenfieldSeedRecord[] {
  return [...readGreenfieldSeedUsers(), ...readGreenfieldSeedProjects()];
}

export function validateGreenfieldSeedScaffold(): GreenfieldSeedValidationResult {
  const errors: string[] = [];
  const users = readGreenfieldSeedUsers();
  const projects = readGreenfieldSeedProjects();

  if (greenfieldSeedScaffold.queueReadiness !== "not_ready") {
    errors.push("seed scaffold queueReadiness must remain not_ready during Phase A");
  }
  if (greenfieldSeedScaffold.appliesToProductionData) {
    errors.push("seed scaffold must not apply to production data");
  }
  if (greenfieldSeedScaffold.environment !== "local_test_only") {
    errors.push("seed scaffold environment must remain local_test_only");
  }

  const seenUserIds = new Set<string>();
  for (const user of users) {
    const validation = validatePersistenceRecord(user);
    errors.push(...validation.errors);
    if (!user.email.endsWith("@example.com")) {
      errors.push(`user ${user.id} must use the example.com reserved domain`);
    }
    if (seenUserIds.has(user.id)) {
      errors.push(`duplicate user id ${user.id}`);
    }
    seenUserIds.add(user.id);
  }

  const seenProjectIds = new Set<string>();
  const seenProjectSlugs = new Set<string>();
  for (const project of projects) {
    const validation = validatePersistenceRecord(project);
    errors.push(...validation.errors);
    if (!seenUserIds.has(project.ownerUserId)) {
      errors.push(`project ${project.id} references unknown owner ${project.ownerUserId}`);
    }
    if (seenProjectIds.has(project.id)) {
      errors.push(`duplicate project id ${project.id}`);
    }
    if (seenProjectSlugs.has(project.slug)) {
      errors.push(`duplicate project slug ${project.slug}`);
    }
    seenProjectIds.add(project.id);
    seenProjectSlugs.add(project.slug);
  }

  return {
    valid: errors.length === 0,
    errors,
    userCount: users.length,
    projectCount: projects.length,
  };
}

function readSeedFixture<T extends GreenfieldSeedRecord>(url: URL, expectedKind: T["kind"]): readonly T[] {
  const parsed = JSON.parse(readFileSync(url, "utf8")) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`${url.pathname} must contain a JSON array`);
  }

  return parsed.map((entry, index) => {
    if (!isPlainObject(entry)) {
      throw new Error(`${url.pathname} entry ${index} must be an object`);
    }
    if (entry.kind !== expectedKind) {
      throw new Error(`${url.pathname} entry ${index} must have kind ${expectedKind}`);
    }
    return entry as T;
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
