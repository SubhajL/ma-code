import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  greenfieldSeedScaffold,
  listGreenfieldSeedRecords,
  readGreenfieldSeedProjects,
  readGreenfieldSeedUsers,
  validateGreenfieldSeedScaffold,
} from "../../../services/api/src/db/seeds.ts";

interface GreenfieldUserFixture {
  kind: "user";
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
}

interface GreenfieldProjectFixture {
  kind: "project";
  id: string;
  ownerUserId: string;
  slug: string;
  name: string;
  createdAt: string;
}

const issueSummaryUrl = new URL("../../../docs/initiatives/greenfield-scaffold/slices/issue-013.summary.json", import.meta.url);
const usersFixtureUrl = new URL("./users.json", import.meta.url);
const projectsFixtureUrl = new URL("./projects.json", import.meta.url);

test("seed scaffold stays phase-a bounded and exposes deterministic local/test fixtures", async () => {
  const summary = JSON.parse(await readFile(issueSummaryUrl, "utf8")) as {
    queueReadiness: string;
    validationProof: string[];
    acceptanceCriteria: string[];
  };
  const users = JSON.parse(await readFile(usersFixtureUrl, "utf8")) as GreenfieldUserFixture[];
  const projects = JSON.parse(await readFile(projectsFixtureUrl, "utf8")) as GreenfieldProjectFixture[];

  assert.equal(summary.queueReadiness, "not_ready");
  assert.deepEqual(summary.validationProof, ["npm run test:api -- seeds"]);
  assert.ok(summary.acceptanceCriteria.includes("Fixture data is deterministic and safe for local/test use only."));

  assert.equal(greenfieldSeedScaffold.queueReadiness, "not_ready");
  assert.equal(greenfieldSeedScaffold.appliesToProductionData, false);
  assert.equal(greenfieldSeedScaffold.environment, "local_test_only");
  assert.equal(greenfieldSeedScaffold.userFixturePath, "tests/fixtures/greenfield/users.json");
  assert.equal(greenfieldSeedScaffold.projectFixturePath, "tests/fixtures/greenfield/projects.json");
  assert.deepEqual(greenfieldSeedScaffold.workerImplementationDependencies.map((dependency) => dependency.issueId), ["issue-014"]);

  assert.deepEqual(readGreenfieldSeedUsers(), users);
  assert.deepEqual(readGreenfieldSeedProjects(), projects);
  assert.deepEqual(listGreenfieldSeedRecords(), [...users, ...projects]);
  assert.ok(users.every((user) => user.email.endsWith("@example.com")));
});

test("seed scaffold validation enforces deterministic ownership-safe records", () => {
  assert.deepEqual(validateGreenfieldSeedScaffold(), {
    valid: true,
    errors: [],
    userCount: 3,
    projectCount: 3,
  });
});
