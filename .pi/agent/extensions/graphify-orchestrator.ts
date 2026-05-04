import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

import graphifyAdapter from "./graphify-adapter.ts";
import {
  decideGraphifyOrchestration,
  type GraphifyOrchestrationDecision,
  type GraphifyOrchestrationDecisionInput,
} from "./graphify-orchestration-decision.ts";

const GRAPHIFY_NEEDS = ["none", "exact_verification", "broad_structure", "architecture_review"] as const;
const GRAPHIFY_PURPOSES = ["architecture_review", "dependency_exploration", "drift_analysis", "large_subsystem_mapping", "curated_research"] as const;
const FRESHNESS_STATUSES = ["fresh", "stale_head", "dirty_worktree", "missing_metadata", "missing_graph"] as const;
const CADENCE_PHASES = ["before_broad_planning", "implementation_loop", "after_structural_change", "before_final_validation"] as const;

const GraphifyOrchestratorSchema = Type.Object({
  need: Type.Union(GRAPHIFY_NEEDS.map((value) => Type.Literal(value)), { description: "Discovery/orchestration need to evaluate." }),
  graphifyAvailable: Type.Optional(Type.Boolean()),
  localFallbackAllowed: Type.Optional(Type.Boolean()),
  graphPresent: Type.Optional(Type.Boolean()),
  freshnessStatus: Type.Optional(Type.Union(FRESHNESS_STATUSES.map((value) => Type.Literal(value)))),
  purpose: Type.Optional(Type.Union(GRAPHIFY_PURPOSES.map((value) => Type.Literal(value)), { description: "Broad Graphify discovery purpose for preflight/scan." })),
  sourcePath: Type.Optional(Type.String({ description: "Repo-local source path passed through to graphify_adapter when a scan/preflight is selected." })),
  taskId: Type.Optional(Type.String({ description: "Task id used for managed Graphify artifact paths." })),
  outputPath: Type.Optional(Type.String({ description: "Optional managed Graphify output path under .pi/agent/artifacts/graphify/." })),
  query: Type.Optional(Type.String({ description: "Query passed to graphify_adapter when query_graph is selected." })),
  preflightToken: Type.Optional(Type.String({ description: "Matching token returned by graphify_adapter preflight; required before scan." })),
  preflightTokenPresent: Type.Optional(Type.Boolean({ description: "Explicit proof that a matching preflight token is present; defaults from preflightToken when omitted." })),
  cadencePhase: Type.Optional(Type.Union(CADENCE_PHASES.map((value) => Type.Literal(value)))),
  largeCorpus: Type.Optional(Type.Boolean()),
  approvedLargeCorpus: Type.Optional(Type.Boolean()),
  maxFilesWithoutApproval: Type.Optional(Type.Integer({ minimum: 1, maximum: 100000 })),
  latestRelevantGraphQueried: Type.Optional(Type.Boolean()),
  importantClaimsSourceVerified: Type.Optional(Type.Boolean()),
  explicitBlocker: Type.Optional(Type.Boolean()),
  extraArgs: Type.Optional(Type.Array(Type.String(), { description: "Safe one-shot args passed to graphify_adapter; adapter retains forbidden-arg blocking such as --watch." })),
  timeoutMs: Type.Optional(Type.Integer({ minimum: 1000, maximum: 300000 })),
});

type GraphifyOrchestratorParams = GraphifyOrchestrationDecisionInput & {
  sourcePath?: string;
  taskId?: string;
  outputPath?: string;
  query?: string;
  preflightToken?: string;
  cadencePhase?: "before_broad_planning" | "implementation_loop" | "after_structural_change" | "before_final_validation";
  maxFilesWithoutApproval?: number;
  extraArgs?: string[];
  timeoutMs?: number;
};

type CapturedTool = {
  name: string;
  execute: (...args: any[]) => Promise<any> | any;
};

function captureGraphifyAdapterTool(): CapturedTool {
  let captured: CapturedTool | null = null;
  const collector = {
    registerTool(tool: CapturedTool) {
      if (tool.name === "graphify_adapter") captured = tool;
    },
  } as ExtensionAPI;

  graphifyAdapter(collector);

  if (!captured) throw new Error("graphify_adapter registration was not captured.");
  return captured;
}

function adapterParamsForDecision(decision: GraphifyOrchestrationDecision, params: GraphifyOrchestratorParams): Record<string, unknown> | null {
  const common = {
    sourcePath: params.sourcePath,
    taskId: params.taskId,
    outputPath: params.outputPath,
    purpose: params.purpose,
    cadencePhase: params.cadencePhase,
    approvedLargeCorpus: params.approvedLargeCorpus,
    maxFilesWithoutApproval: params.maxFilesWithoutApproval,
    extraArgs: params.extraArgs,
    timeoutMs: params.timeoutMs,
  };

  if (decision.action === "run_preflight") {
    return { ...common, action: "preflight" };
  }

  if (decision.action === "run_scan") {
    return { ...common, action: "scan", preflightToken: params.preflightToken };
  }

  if (decision.action === "check_freshness") {
    return { action: "freshness", taskId: params.taskId, outputPath: params.outputPath, cadencePhase: params.cadencePhase };
  }

  if (decision.action === "query_graph") {
    return { action: "query", taskId: params.taskId, outputPath: params.outputPath, query: params.query };
  }

  return null;
}

function summarize(decision: GraphifyOrchestrationDecision, adapterAction: string | null): string {
  const adapterSummary = adapterAction ? `; delegated to graphify_adapter action=${adapterAction}` : "; no adapter action was needed";
  return `Graphify orchestration action: ${decision.action}${adapterSummary}. ${decision.reason}`;
}

function commandStatus(decision: GraphifyOrchestrationDecision, adapterResult: any): "completed" | "blocked" {
  if (decision.blocking) return "blocked";
  const adapterStatus = typeof adapterResult?.details?.status === "string" ? adapterResult.details.status : "";
  return adapterStatus.startsWith("blocked") ? "blocked" : "completed";
}

export default function (pi: ExtensionAPI) {
  const adapterTool = captureGraphifyAdapterTool();

  pi.registerTool({
    name: "run_graphify_orchestration",
    label: "Run Graphify Orchestration",
    description: "Bounded runtime command that selects one Graphify orchestration step and delegates execution to the existing graphify_adapter tool.",
    promptSnippet: "Use run_graphify_orchestration when a bounded Graphify next step should be selected and executed through graphify_adapter.",
    promptGuidelines: [
      "Executes at most one graphify_adapter action per call.",
      "Do not use it for narrow exact verification; local read/rg/find is preferred there.",
      "Do not pass --watch or daemon/background flags; graphify_adapter blocks forbidden flags if supplied.",
      "Verify important Graphify-derived claims by direct source inspection before planning, validation, or acceptance.",
    ],
    parameters: GraphifyOrchestratorSchema,
    async execute(toolCallId, params: GraphifyOrchestratorParams, signal, onUpdate, ctx) {
      const decisionInput: GraphifyOrchestrationDecisionInput = {
        need: params.need,
        graphifyAvailable: params.graphifyAvailable,
        localFallbackAllowed: params.localFallbackAllowed,
        graphPresent: params.graphPresent,
        freshnessStatus: params.freshnessStatus,
        purpose: params.purpose,
        preflightTokenPresent: params.preflightTokenPresent ?? Boolean(params.preflightToken),
        largeCorpus: params.largeCorpus,
        approvedLargeCorpus: params.approvedLargeCorpus,
        latestRelevantGraphQueried: params.latestRelevantGraphQueried,
        importantClaimsSourceVerified: params.importantClaimsSourceVerified,
        explicitBlocker: params.explicitBlocker,
      };
      const decision = decideGraphifyOrchestration(decisionInput);
      const adapterParams = adapterParamsForDecision(decision, params);
      const adapterAction = typeof adapterParams?.action === "string" ? adapterParams.action : null;
      const adapterResult = adapterParams ? await adapterTool.execute(toolCallId, adapterParams, signal, onUpdate, ctx) : null;

      return {
        content: [{ type: "text" as const, text: summarize(decision, adapterAction) }],
        details: {
          status: commandStatus(decision, adapterResult),
          decision,
          adapterAction,
          adapterParams,
          adapterResult,
        },
      };
    },
  });
}
