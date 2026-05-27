import assert from "node:assert/strict";
import test from "node:test";

import * as facade from "../../.pi/agent/extensions/orchestrator.ts";
import facadeDefault from "../../.pi/agent/extensions/orchestrator.ts";
import { classifyOrchestratorGoal as classifyDirect } from "../../.pi/agent/extensions/orchestrator-classifier.ts";
import { FakePi } from "./test-utils.ts";

const HELPER_EXPORTS = [
  "slugFromGoal",
  "classifyOrchestratorGoal",
  "analyzeOrchestratorContext",
  "collectOrchestratorContextSignals",
  "assertSafeDelegatedDryRunCommand",
  "planOrchestratorDryRun",
  "rejectUnsafeApplyVerb",
  "buildOrchestratorApplyPlan",
  "assertCreatedFilesWithinAllowlist",
  "runOrchestratorApply",
  "assertSafeDelegatedRunCommand",
  "defaultOrchestratorRunPreflight",
  "runOrchestratorRun",
  "runOrchestratorContinue",
  "collectOrchestratorEvidence",
  "assertNoRawGitMergeCommand",
  "runOrchestratorMergeCheck",
  "runOrchestratorMergeApply",
] as const;

const SUBEXTENSION_FACTORIES = [
  "orchestratorClassifierExtension",
  "orchestratorContextExtension",
  "orchestratorDryRunExtension",
  "orchestratorApplyPolicyExtension",
  "orchestratorRunExtension",
  "orchestratorContinueExtension",
  "orchestratorEvidenceExtension",
] as const;

test("orchestrator facade re-exports public helper functions", () => {
  for (const name of HELPER_EXPORTS) {
    assert.equal(
      typeof (facade as Record<string, unknown>)[name],
      "function",
      `${name} should be re-exported as a function`,
    );
  }
});

test("orchestrator facade exposes sub-extension factories", () => {
  for (const name of SUBEXTENSION_FACTORIES) {
    assert.equal(
      typeof (facade as Record<string, unknown>)[name],
      "function",
      `${name} should be exposed as a default alias`,
    );
  }
});

test("orchestrator facade preserves classifier behavior through re-export", () => {
  const input = {
    goal: "ship feat/foo",
    packageScripts: [] as string[],
  };
  const viaFacade = facade.classifyOrchestratorGoal(input);
  const viaDirect = classifyDirect(input);
  assert.deepEqual(viaFacade, viaDirect);
});

test("orchestrator facade default registers all seven sub-extensions without throwing", () => {
  const pi = new FakePi(null);
  assert.doesNotThrow(() => facadeDefault(pi as any));
});
