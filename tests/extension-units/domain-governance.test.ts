import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  assessDomainGovernance,
  parseDomainGovernancePolicy,
} from "../../.pi/agent/extensions/domain-governance.ts";

async function readPolicy() {
  const raw = await readFile(new URL("../../.pi/agent/governance/domain-governance-policy.json", import.meta.url), "utf8");
  return parseDomainGovernancePolicy(JSON.parse(raw));
}

test("domain governance policy parses role defaults", async () => {
  const policy = await readPolicy();

  assert.equal(policy.domainRoleDefaults.frontend, "frontend_worker");
  assert.equal(policy.domainRoleDefaults.backend, "backend_worker");
  assert.equal(policy.domainRoleDefaults.infra, "infra_worker");
  assert.equal(policy.pathOwnershipMode, "advisory_first");
});

test("backend domain assigned to backend worker passes", async () => {
  const policy = await readPolicy();
  const result = assessDomainGovernance(policy, {
    domains: ["backend"],
    assignedRole: "backend_worker",
    workType: "implementation",
    allowedPaths: [".pi/agent/extensions/task-packets.ts"],
    filesToModify: [".pi/agent/extensions/task-packets.ts"],
  });

  assert.equal(result.pass, true);
  assert.deepEqual(result.blockReasons, []);
});

test("backend domain assigned to frontend worker fails", async () => {
  const policy = await readPolicy();
  const result = assessDomainGovernance(policy, {
    domains: ["backend"],
    assignedRole: "frontend_worker",
    workType: "implementation",
    allowedPaths: [".pi/agent/extensions/task-packets.ts"],
    filesToModify: [".pi/agent/extensions/task-packets.ts"],
  });

  assert.equal(result.pass, false);
  assert.match(result.blockReasons.join("\n"), /backend.*backend_worker/i);
});

test("frontend domain assigned to backend worker fails", async () => {
  const policy = await readPolicy();
  const result = assessDomainGovernance(policy, {
    domains: ["frontend"],
    assignedRole: "backend_worker",
    workType: "implementation",
    allowedPaths: ["src/components/Button.tsx"],
    filesToModify: ["src/components/Button.tsx"],
  });

  assert.equal(result.pass, false);
  assert.match(result.blockReasons.join("\n"), /frontend.*frontend_worker/i);
});

test("mixed frontend/backend domains require explicit escalation or multi-lane note", async () => {
  const policy = await readPolicy();
  const result = assessDomainGovernance(policy, {
    domains: ["frontend", "backend"],
    assignedRole: "backend_worker",
    workType: "implementation",
    allowedPaths: ["src/components", "api"],
    filesToModify: ["src/components/App.tsx", "api/routes.ts"],
  });

  assert.equal(result.pass, false);
  assert.match(result.blockReasons.join("\n"), /mixed-domain/i);
});

test("mixed frontend/backend domains with explicit escalation pass", async () => {
  const policy = await readPolicy();
  const result = assessDomainGovernance(policy, {
    domains: ["frontend", "backend"],
    assignedRole: "backend_worker",
    workType: "implementation",
    allowedPaths: ["src/components", "api"],
    filesToModify: ["src/components/App.tsx", "api/routes.ts"],
    escalationInstructions: ["Mixed-domain slice approved with backend owner and frontend review checkpoint."],
  });

  assert.equal(result.pass, true);
  assert.ok(result.warnings.some((warning) => /mixed-domain/i.test(warning)));
});

test("implementation slices without concrete path boundaries warn while policy is advisory-first", async () => {
  const policy = await readPolicy();
  const result = assessDomainGovernance(policy, {
    domains: ["backend"],
    assignedRole: "backend_worker",
    workType: "implementation",
    allowedPaths: [],
    filesToModify: [],
  });

  assert.equal(result.pass, true);
  assert.match(result.warnings.join("\n"), /allowedPaths/i);
  assert.match(result.warnings.join("\n"), /filesToModify/i);
});
