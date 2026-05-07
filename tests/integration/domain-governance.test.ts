import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { createRequire } from "node:module";
import { access, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { parseHarnessRoutingConfig } from "../../.pi/agent/extensions/harness-routing.ts";
import { generateTaskPacket, parsePacketPolicy } from "../../.pi/agent/extensions/task-packets.ts";
import { parseTeamDefinition } from "../../.pi/agent/extensions/team-activation.ts";

const execFile = promisify(execFileCallback);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const tsxImportPath = process.env.TSX_IMPORT_PATH ?? createRequire(import.meta.url).resolve("tsx");
const initFeatureScript = join(repoRoot, "scripts", "harness-init-feature.ts");

async function readFixture(relativePath: string): Promise<string> {
  return readFile(join(repoRoot, relativePath), "utf8");
}

async function packetFixtures() {
  return {
    routingConfig: parseHarnessRoutingConfig(JSON.parse(await readFixture(".pi/agent/models.json"))),
    packetPolicy: parsePacketPolicy(JSON.parse(await readFixture(".pi/agent/packets/packet-policy.json"))),
    teams: {
      planning: parseTeamDefinition(await readFixture(".pi/agent/teams/planning.yaml"), "planning"),
      build: parseTeamDefinition(await readFixture(".pi/agent/teams/build.yaml"), "build"),
      quality: parseTeamDefinition(await readFixture(".pi/agent/teams/quality.yaml"), "quality"),
      recovery: parseTeamDefinition(await readFixture(".pi/agent/teams/recovery.yaml"), "recovery"),
    },
  };
}

function tddSlice(label: string) {
  return {
    firstTracerBehavior: `${label} has one tracer behavior.`,
    publicInterface: "generateTaskPacket",
    testSurface: ["tests/integration/domain-governance.test.ts"],
    boundaryDependencies: [".pi/agent/extensions/task-packets.ts"],
    mockPlan: "Use real packet policies and team fixtures.",
    outOfScopeBehaviors: ["No runtime daemon enforcement."],
  };
}

async function tempRepo(prefix: string) {
  const repoPath = await mkdtemp(join(tmpdir(), prefix));
  const templateDir = join(repoPath, "docs", "initiatives", "TEMPLATE");
  await mkdir(templateDir, { recursive: true });
  await writeFile(join(templateDir, "prd.md"), "# PRD\n", "utf8");
  await writeFile(join(templateDir, "backlog.md"), "# Backlog\n", "utf8");
  await writeFile(join(templateDir, "decisions.md"), "# Decisions\n", "utf8");
  return repoPath;
}

async function exists(pathValue: string): Promise<boolean> {
  try {
    await access(pathValue);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ENOENT";
  }
}

test("packet generation blocks backend domain assigned to frontend worker", async () => {
  const { packetPolicy, teams, routingConfig } = await packetFixtures();

  assert.throws(
    () => generateTaskPacket(packetPolicy, teams, routingConfig, {
      sourceGoalId: "domain-mismatch",
      assignedTeam: "build",
      assignedRole: "frontend_worker",
      title: "Implement backend domain with wrong worker",
      scope: "Backend-only runtime helper.",
      workType: "implementation",
      domains: ["backend"],
      allowedPaths: [".pi/agent/extensions/task-packets.ts"],
      filesToModify: [".pi/agent/extensions/task-packets.ts"],
      acceptanceCriteria: ["Wrong role/domain pairing is blocked"],
      tddSlice: tddSlice("Wrong role/domain pairing"),
    }),
    /backend.*backend_worker/i,
  );
});

test("packet generation blocks mixed frontend/backend packet without explicit escalation", async () => {
  const { packetPolicy, teams, routingConfig } = await packetFixtures();

  assert.throws(
    () => generateTaskPacket(packetPolicy, teams, routingConfig, {
      sourceGoalId: "mixed-domain-missing-note",
      assignedTeam: "build",
      assignedRole: "backend_worker",
      title: "Implement vertical frontend backend slice",
      scope: "Frontend and backend files in one bounded slice.",
      workType: "implementation",
      domains: ["frontend", "backend"],
      allowedPaths: ["src/components", "api"],
      filesToModify: ["src/components/App.tsx", "api/routes.ts"],
      acceptanceCriteria: ["Mixed-domain work is explicit"],
      tddSlice: tddSlice("Mixed-domain missing note"),
    }),
    /mixed-domain work requires/i,
  );
});

test("packet generation allows mixed-domain packet with explicit escalation", async () => {
  const { packetPolicy, teams, routingConfig } = await packetFixtures();

  const generated = generateTaskPacket(packetPolicy, teams, routingConfig, {
    sourceGoalId: "mixed-domain-with-note",
    assignedTeam: "build",
    assignedRole: "backend_worker",
    title: "Implement vertical frontend backend slice",
    scope: "Frontend and backend files in one bounded slice.",
    workType: "implementation",
    domains: ["frontend", "backend"],
    allowedPaths: ["src/components", "api"],
    filesToModify: ["src/components/App.tsx", "api/routes.ts"],
    acceptanceCriteria: ["Mixed-domain work is explicit"],
    escalationInstructions: ["Mixed-domain slice approved with backend owner and frontend review checkpoint."],
    tddSlice: tddSlice("Mixed-domain with note"),
  });

  assert.equal(generated.packet.assignedRole, "backend_worker");
  assert.match(generated.policyNotes.join("\n"), /mixed-domain/i);
});

test("feature bootstrap creates frontend docs only when frontend domain is requested", async () => {
  const repoPath = await tempRepo("domain-governance-feature-frontend-");
  const result = await execFile(process.execPath, ["--import", tsxImportPath, initFeatureScript, "--slug", "checkout-ui", "--domains", "frontend", "--json"], {
    cwd: repoPath,
    encoding: "utf8",
  });
  const parsed = JSON.parse(result.stdout) as { createdFiles: string[]; domains: string[] };

  assert.deepEqual(parsed.domains, ["frontend"]);
  assert.ok(parsed.createdFiles.includes("docs/frontend/README.md"));
  assert.equal(await exists(join(repoPath, "docs", "frontend", "README.md")), true);
  assert.equal(await exists(join(repoPath, "docs", "backend")), false);
});

test("feature bootstrap without frontend/backend domains does not create domain docs", async () => {
  const repoPath = await tempRepo("domain-governance-feature-docs-");
  const result = await execFile(process.execPath, ["--import", tsxImportPath, initFeatureScript, "--slug", "research-notes", "--domains", "docs", "--json"], {
    cwd: repoPath,
    encoding: "utf8",
  });
  const parsed = JSON.parse(result.stdout) as { createdFiles: string[]; domains: string[] };

  assert.deepEqual(parsed.domains, ["docs"]);
  assert.equal(parsed.createdFiles.some((file) => file.startsWith("docs/frontend/") || file.startsWith("docs/backend/")), false);
  assert.equal(await exists(join(repoPath, "docs", "frontend")), false);
  assert.equal(await exists(join(repoPath, "docs", "backend")), false);
});


test("feature bootstrap fails clearly when --domains value is missing", async () => {
  const repoPath = await tempRepo("domain-governance-feature-missing-domain-");

  await assert.rejects(
    execFile(process.execPath, ["--import", tsxImportPath, initFeatureScript, "--slug", "checkout-ui", "--domains", "--json"], {
      cwd: repoPath,
      encoding: "utf8",
    }),
    /--domains requires a value/,
  );
});
