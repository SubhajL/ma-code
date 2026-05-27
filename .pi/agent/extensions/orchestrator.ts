import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import orchestratorClassifierExtension from "./orchestrator-classifier.ts";
import orchestratorContextExtension from "./orchestrator-context.ts";
import orchestratorDryRunExtension from "./orchestrator-dry-run.ts";
import orchestratorApplyPolicyExtension from "./orchestrator-apply-policy.ts";
import orchestratorRunExtension from "./orchestrator-run.ts";
import orchestratorContinueExtension from "./orchestrator-continue.ts";
import orchestratorEvidenceExtension from "./orchestrator-evidence.ts";

export * from "./orchestrator-classifier.ts";
export * from "./orchestrator-context.ts";
export * from "./orchestrator-dry-run.ts";
export * from "./orchestrator-apply-policy.ts";
export * from "./orchestrator-run.ts";
export * from "./orchestrator-continue.ts";
export * from "./orchestrator-evidence.ts";

export { default as orchestratorClassifierExtension } from "./orchestrator-classifier.ts";
export { default as orchestratorContextExtension } from "./orchestrator-context.ts";
export { default as orchestratorDryRunExtension } from "./orchestrator-dry-run.ts";
export { default as orchestratorApplyPolicyExtension } from "./orchestrator-apply-policy.ts";
export { default as orchestratorRunExtension } from "./orchestrator-run.ts";
export { default as orchestratorContinueExtension } from "./orchestrator-continue.ts";
export { default as orchestratorEvidenceExtension } from "./orchestrator-evidence.ts";

// Explicit named re-exports — also covered by `export *` above, but listed
// here so the facade source is the single discoverable contract surface
// (and so static-check needles in scripts/check-repo-static.sh can verify
// the facade still exposes every helper that callers rely on).
export { slugFromGoal, classifyOrchestratorGoal } from "./orchestrator-classifier.ts";
export { analyzeOrchestratorContext, collectOrchestratorContextSignals } from "./orchestrator-context.ts";
export { assertSafeDelegatedDryRunCommand, planOrchestratorDryRun } from "./orchestrator-dry-run.ts";
export {
  rejectUnsafeApplyVerb,
  buildOrchestratorApplyPlan,
  assertCreatedFilesWithinAllowlist,
  runOrchestratorApply,
} from "./orchestrator-apply-policy.ts";
export {
  assertSafeDelegatedRunCommand,
  defaultOrchestratorRunPreflight,
  runOrchestratorRun,
} from "./orchestrator-run.ts";
export { runOrchestratorContinue } from "./orchestrator-continue.ts";
export {
  collectOrchestratorEvidence,
  assertNoRawGitMergeCommand,
  runOrchestratorMergeCheck,
  runOrchestratorMergeApply,
} from "./orchestrator-evidence.ts";

export default function orchestratorExtension(_pi: ExtensionAPI): void {
  // The 7 sub-extension factories are currently no-op `(): void {}` stubs
  // (the orchestrator surface is consumed as helper functions, not as Pi
  // tool registrations). Calling them here preserves the recovery/packets
  // facade shape and forward-proofs the facade: if any sub-extension ever
  // becomes tool-registering, lifting its signature to take `pi` and
  // forwarding it here is the only change needed.
  orchestratorClassifierExtension();
  orchestratorContextExtension();
  orchestratorDryRunExtension();
  orchestratorApplyPolicyExtension();
  orchestratorRunExtension();
  orchestratorContinueExtension();
  orchestratorEvidenceExtension();
}
