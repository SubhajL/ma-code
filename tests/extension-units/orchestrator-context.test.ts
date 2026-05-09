import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  analyzeOrchestratorContext,
  collectOrchestratorContextSignals,
  type OrchestratorContextSignals,
} from "../../.pi/agent/extensions/orchestrator-context.ts";

test("classifies harness repo signals as existing harness and not greenfield", () => {
  const result = analyzeOrchestratorContext({
    packageJsonExists: true,
    packageName: "ma-code-harness-032-dev",
    packageScripts: ["harness:orchestrate", "validate:orchestrator-run"],
    hasPiAgent: true,
    extensionCount: 30,
    scriptCount: 50,
    testCount: 20,
    git: { isGitRepo: true, commitCount: 100 },
  });

  assert.equal(result.repoContext, "existing_harness_repo");
  assert.equal(result.greenfieldEligible, false);
  assert.ok(result.blockedModes.includes("greenfield_assumption"));
  assert.ok(result.safeNextModes.includes("bounded_worker"));
});

test("greenfield wording or slug does not override existing initiative artifacts", () => {
  const result = analyzeOrchestratorContext({
    goal: "continue greenfield scaffold AFK issues",
    packageJsonExists: true,
    packageName: "real-app",
    packageScripts: ["test"],
    git: { isGitRepo: true, commitCount: 12 },
    initiative: {
      slug: "greenfield-scaffold",
      exists: true,
      hasIssues: true,
      hasPipeline: true,
      hasSlicePlan: true,
      sliceCount: 18,
    },
  });

  assert.equal(result.repoContext, "brownfield_project");
  assert.equal(result.initiativeMaturity, "active_existing_initiative");
  assert.equal(result.greenfieldEligible, false);
  assert.ok(result.blockedModes.includes("greenfield_assumption"));
  assert.ok(result.reasoning.some((line) => line.includes("label-only")));
  assert.ok(result.safeNextModes.includes("afk_queue"));
});

test("minimal empty repo signals remain greenfield eligible", () => {
  const result = analyzeOrchestratorContext({
    packageJsonExists: false,
    scriptCount: 0,
    testCount: 0,
    extensionCount: 0,
    hasPiAgent: false,
    git: { isGitRepo: true, commitCount: 1 },
  });

  assert.equal(result.repoContext, "greenfield_candidate");
  assert.equal(result.initiativeMaturity, "none");
  assert.equal(result.greenfieldEligible, true);
  assert.equal(result.blockedModes.includes("greenfield_assumption"), false);
});

test("planning initiative artifacts make initiative planning but not active", () => {
  const result = analyzeOrchestratorContext({
    packageJsonExists: true,
    packageName: "existing-app",
    packageScripts: ["test"],
    initiative: {
      slug: "checkout",
      exists: true,
      hasPrd: true,
      hasBacklog: true,
      hasDecisions: true,
    },
  });

  assert.equal(result.initiativeMaturity, "planning");
  assert.equal(result.greenfieldEligible, false);
  assert.ok(result.blockedModes.includes("greenfield_assumption"));
});

test("collector reads initiative artifacts without writing files", async () => {
  const repo = await mkdtemp(join(tmpdir(), "orchestrator-context-"));
  await writeFile(join(repo, "package.json"), JSON.stringify({ name: "existing-app", scripts: { test: "node --test" } }), "utf8");
  await mkdir(join(repo, "docs", "initiatives", "checkout", "slices"), { recursive: true });
  await writeFile(join(repo, "docs", "initiatives", "checkout", "issues.json"), "[]", "utf8");
  await writeFile(join(repo, "docs", "initiatives", "checkout", "pipeline.json"), "{}", "utf8");
  await writeFile(join(repo, "docs", "initiatives", "checkout", "slice-plan.json"), "{}", "utf8");
  const before = await snapshot(repo);

  const signals = await collectOrchestratorContextSignals({ repoRoot: repo, initiativeSlug: "checkout", goal: "continue checkout" });
  const result = analyzeOrchestratorContext(signals);
  const after = await snapshot(repo);

  assert.equal(result.initiativeMaturity, "active_existing_initiative");
  assert.equal(result.greenfieldEligible, false);
  assert.deepEqual(after, before);
});

async function snapshot(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string, prefix = ""): Promise<void> {
    const entries = await import("node:fs/promises").then((fs) => fs.readdir(dir, { withFileTypes: true }));
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      out.push(rel);
      if (entry.isDirectory()) await walk(join(dir, entry.name), rel);
    }
  }
  await walk(root);
  return out;
}
